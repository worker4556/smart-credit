"""Маршрут к одобрению: шаги клиента, сроки и пересчёт — по тем же правилам, что предоценка и решение.

Правила (спецификация, раздел 8):
- срок «~N мес.» = максимум сроков шагов, нужных, чтобы снять стопы и дойти до порога одобрения;
- шаги выбираются по отношению «баллы / месяцы»; время само двигает возраст бизнеса, срок счёта и окно 90+;
- если сумму держит оборот, маршрут не обещает её ростом баллов;
- неустранимые причины и 115-ФЗ — маршрута нет, так и пишем;
- пересчёт не создаёт заявку и не делает запрос в БКИ.
"""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel

from .config import Policy
from .decision import available_amount, decide, limit
from .finance import cost
from .schemas import Applicant, Cost
from .scoring import avg_turnover, effective_turnover, score

Holds = Literal["NONE", "SCORE", "STOP", "TIME_WINDOW", "TURNOVER", "STOP_PERMANENT", "NONCREDIT"]


class RouteStep(BaseModel):
    code: str
    kind: Literal["STOP", "FACTOR", "TIME_WINDOW", "WAIT", "TURNOVER"]
    action: str
    term: str
    months: float | None
    points_gain: int | None = None
    target_turnover: int | None = None
    bki_delay_business_days: int | None = None


class Projection(BaseModel):
    score: int
    limit: int
    available_amount: int
    outcome: str
    amount: int | None
    cost: Cost | None


class SpecialistDecision(BaseModel):
    """Итоговое решение специалиста (путь G): маршрут строится от него, а не от рекомендации системы."""
    outcome: Literal["APPROVED", "COUNTER_OFFER", "INFO_REQUESTED", "REJECTED"]
    reason_code: str
    amount: int | None = None


class Route(BaseModel):
    policy_version: str
    based_on: Literal["SYSTEM", "SPECIALIST"] = "SYSTEM"
    status: Literal["ACTIVE", "READY", "NO_ROUTE"]
    holds: Holds
    target_amount: int
    current_score: int
    current_available_amount: int
    steps: list[RouteStep]
    time_gain_points: int
    horizon_months: float | None
    horizon_text: str
    reachable: bool
    projection: Projection | None
    advice: list[str]
    message: str
    disclaimer: str


# ---------- эффекты шагов: как меняются данные ----------

def _upd(a: Applicant, part: str, **kw) -> Applicant:
    return a.model_copy(update={part: getattr(a, part).model_copy(update=kw)})


def apply_effect(policy: Policy, a: Applicant, code: str) -> Applicant:
    effect = policy.reason(code).get("step", {}).get("effect")
    rc = policy.route
    if effect == "clear_tax_debt":
        return _upd(a, "company", tax_debt=0)
    if effect == "clear_fns_block":
        return _upd(a, "company", fns_blocked=False)
    if effect == "clear_lawsuit":
        return _upd(a, "company", recovery_lawsuit=False)
    if effect == "clear_fssp":
        return _upd(a, "company", fssp_debt=0)
    if effect == "clear_current_overdue":
        return _upd(a, "owner", current_overdue=False)
    if effect == "reduce_card_utilization":
        return _upd(a, "owner", card_utilization=rc["card_utilization_target"])
    if effect == "reduce_business_payments":
        t = avg_turnover(a)
        best = policy.factors["debt_load"]["bins"][0]["max"]
        pay = a.account.business_monthly_payments
        target = min(pay, int(t * best))
        debt = int(a.account.business_debt * target / pay) if pay else a.account.business_debt
        return _upd(a, "account", business_monthly_payments=target, business_debt=debt)
    if effect == "regular_turnover":
        # Вся выручка через один счёт: уровень — заявленная выручка (если она выше видимой), поступления ровные
        level = max(avg_turnover(a), a.checks.declared_monthly_revenue or 0)
        cv = rc["regular_turnover_cv"]
        series = [round(level * (1 + cv if i % 2 else 1 - cv)) for i in range(6)]
        return _upd(a, "account", turnover_monthly=series, external_turnover_monthly=None)
    return a


def advance(a: Applicant, months: float) -> Applicant:
    """Сдвиг во времени: возраст бизнеса, срок счёта, давность эпизода 90+. Недели — не месяц."""
    m = int(math.floor(months + 1e-9))
    if m <= 0:
        return a
    a = _upd(a, "company", business_age_months=a.company.business_age_months + m)
    a = _upd(a, "account", rko_months=a.account.rko_months + m)
    if a.owner.months_since_90plus is not None:
        a = _upd(a, "owner", months_since_90plus=a.owner.months_since_90plus + m)
    return a


CANDIDATE_EFFECTS = {"regular_turnover", "reduce_business_payments", "reduce_card_utilization", "clear_fssp"}


def _score_at(policy: Policy, a: Applicant, months: float) -> int:
    return score(policy, advance(a, months)).score


def _turnover_pace(a: Applicant, min_r2: float = 0.5) -> float:
    """Наклон линейного тренда поступлений, ₽ в месяц. Если тренд не выражен (R² < min_r2) — 0: срок не обещаем."""
    ys = effective_turnover(a)
    n = len(ys)
    if n < 3:
        return 0.0
    xm, ym = (n - 1) / 2, sum(ys) / n
    sxx = sum((x - xm) ** 2 for x in range(n))
    sxy = sum((x - xm) * (y - ym) for x, y in enumerate(ys))
    syy = sum((y - ym) ** 2 for y in ys)
    if syy == 0:
        return 0.0
    r2 = sxy * sxy / (sxx * syy)
    return sxy / sxx if r2 >= min_r2 else 0.0


def _step(policy: Policy, code: str, kind: str, months: float | None, **kw) -> RouteStep:
    s = policy.reason(code).get("step", {})
    bki = policy.route["bki_update_business_days"] if s.get("bki") else None
    return RouteStep(code=code, kind=kind, action=s.get("action", policy.reason(code)["text"]),
                     term=s.get("term", ""), months=months, bki_delay_business_days=bki, **kw)


def _horizon_text(months: float | None, time_window: bool, steps: list[RouteStep]) -> str:
    if months is None:
        return "срок зависит от темпа роста оборота"
    if not steps:
        return "можно подавать заявку"
    text = "недели" if months <= 0.5 else f"~{math.ceil(months)} мес."
    return text + (", ускорить нельзя" if time_window else "")


# ---------- построение маршрута ----------

def build_route(policy: Policy, a: Applicant, assume_done: list[str] | None = None,
                specialist: SpecialistDecision | None = None) -> Route:
    rc, approve = policy.route, policy.decision["approve_score"]
    for code in assume_done or []:
        a = apply_effect(policy, a, code)

    sc = score(policy, a)
    lim0 = limit(policy, a)
    available_now = available_amount(policy, sc, lim0)
    if specialist and specialist.outcome in ("APPROVED", "COUNTER_OFFER") and specialist.amount is not None:
        available_now = specialist.amount
    elif specialist and specialist.outcome == "REJECTED":
        available_now = 0
    base = dict(policy_version=policy.version, based_on="SPECIALIST" if specialist else "SYSTEM",
                target_amount=a.request.amount, current_score=sc.score,
                current_available_amount=available_now, disclaimer=rc["disclaimer"])

    def no_route(holds: Holds, message: str) -> Route:
        return Route(status="NO_ROUTE", holds=holds, steps=[], time_gain_points=0, horizon_months=None,
                     horizon_text="маршрута нет", reachable=False, projection=None, advice=[], message=message, **base)

    if a.company.zsk_level == "RED" or a.company.measures_115fz:
        return no_route("NONCREDIT", policy.reason("Z_115")["text"])
    if specialist and specialist.reason_code not in policy.reasons:
        raise ValueError(f"Код причины {specialist.reason_code} не из справочника")
    if specialist and policy.reason(specialist.reason_code).get("permanent"):
        r = policy.reason(specialist.reason_code)
        return no_route("STOP_PERMANENT", f"{r['text']}. Это нельзя изменить действиями — маршрута к одобрению нет.")
    permanent = [s for s in sc.stops if s.permanent]
    if permanent:
        return no_route("STOP_PERMANENT", f"{permanent[0].text}. Это нельзя изменить действиями — маршрута к одобрению нет.")

    # 1. Стопы: временные окна — ждать, устранимые — обязательные шаги
    steps: list[RouteStep] = []
    state, horizon, time_window = a, 0.0, False
    advice: list[str] = []
    for s in sc.stops:
        if s.months_to_clear is not None:
            time_window = True
            horizon = max(horizon, s.months_to_clear)
            steps.append(_step(policy, s.code, "TIME_WINDOW", s.months_to_clear))
        else:
            months = policy.step_months(s.code) or 0.0
            state = apply_effect(policy, state, s.code)
            horizon = max(horizon, months)
            steps.append(_step(policy, s.code, "STOP", months))
        if policy.reason(s.code).get("advice"):
            advice.append(policy.reason(s.code)["advice"])

    # Причина специалиста — обязательный шаг, даже если система её не видела
    if specialist:
        code = specialist.reason_code
        step = policy.reason(code).get("step", {})
        if code not in {st.code for st in steps} and step.get("effect") not in (None, "alternative", "time", "time_window", "turnover_growth"):
            months = policy.step_months(code) or 0.0
            state = apply_effect(policy, state, code)
            horizon = max(horizon, months)
            steps.insert(0, _step(policy, code, "FACTOR" if policy.reason(code)["kind"] == "FACTOR" else "STOP", months))

    # 2. Факторы: жадно по «баллы / месяцы», пока прогноз на горизонте не дойдёт до порога
    candidates = {f.reason_code for f in score(policy, state).factors if f.shortfall > 0
                  and policy.reason(f.reason_code).get("step", {}).get("effect") in CANDIDATE_EFFECTS}
    while _score_at(policy, state, horizon) < approve:
        now = _score_at(policy, state, horizon)
        best = None  # (ratio, code, new_state, new_horizon)
        for code in candidates:
            months = policy.step_months(code) or 0.0
            new_state, new_h = apply_effect(policy, state, code), max(horizon, months)
            gain = _score_at(policy, new_state, new_h) - now
            if gain > 0:
                ratio = gain / max(months, rc["weeks_as_months"])
                if best is None or ratio > best[0]:
                    best = (ratio, code, new_state, new_h)
        for wait in range(1, rc["max_horizon_months"] + 1):  # просто подождать (возраст бизнеса, срок счёта)
            if horizon + wait > rc["max_horizon_months"]:
                break
            gain = _score_at(policy, state, horizon + wait) - now
            if gain > 0:
                if best is None or gain / wait > best[0]:
                    best = (gain / wait, "B_AGE", state, horizon + wait)
                break
        if best is None:
            break
        _, code, state, new_h = best
        if code == "B_AGE":
            steps.append(_step(policy, "B_AGE", "WAIT", new_h - horizon))
        else:
            candidates.discard(code)
            steps.append(_step(policy, code, "FACTOR", policy.step_months(code)))
        horizon = new_h

    # Вклад каждого шага — изменение данных без учёта времени; время — отдельной строкой
    acc, prev = a, sc.score
    for st in steps:
        if st.kind in ("STOP", "FACTOR"):
            acc = apply_effect(policy, acc, st.code)
            cur = score(policy, acc).score
            st.points_gain, prev = cur - prev, cur
    final = advance(state, horizon)
    fsc = score(policy, final)
    time_gain = fsc.score - prev

    # 3. Сумму держит оборот? Не обещаем её ростом баллов
    flim = limit(policy, final)
    holds: Holds
    turnover_bound = fsc.score >= approve and not fsc.stops and flim.limit < a.request.amount and flim.binding == "TURNOVER"
    if turnover_bound and not steps:
        lc = policy.products[a.request.product]["limit"]
        need = a.request.amount / lc.get("turnover_multiple", lc.get("turnover_share", 1))
        pace = _turnover_pace(final)
        gap = need - avg_turnover(final)
        months = math.ceil(gap / pace) if pace > 0 else None
        steps.append(_step(policy, "L_TURNOVER", "TURNOVER", months, target_turnover=int(math.ceil(need / 10000) * 10000)))
        horizon = None if months is None else max(horizon, months)
        holds = "TURNOVER"
    elif time_window:
        holds = "TIME_WINDOW"
    elif sc.stops:
        holds = "STOP"
    elif steps:
        holds = "SCORE"
    else:
        holds = "NONE"

    reachable = fsc.score >= approve and not fsc.stops
    fdec = decide(policy, final, stage="PRECHECK")
    projection = Projection(score=fsc.score, limit=flim.limit, available_amount=available_amount(policy, fsc, flim),
                            outcome=fdec.outcome, amount=fdec.amount,
                            cost=cost(policy, a.request.product, fdec.amount, fdec.term_months) if fdec.amount else None)
    ready = not sc.stops and sc.score >= approve and lim0.limit >= a.request.amount \
        and not (specialist and specialist.outcome == "REJECTED")
    return Route(status="READY" if ready else "ACTIVE", holds=holds, steps=steps, time_gain_points=time_gain,
                 horizon_months=horizon, horizon_text=_horizon_text(horizon, time_window, steps), reachable=reachable,
                 projection=projection, advice=advice, message=_message(holds, reachable, ready, turnover_bound), **base)


def _message(holds: Holds, reachable: bool, ready: bool, turnover_bound: bool) -> str:
    if ready:
        return "Прогноз дошёл до порога — можно подать новую заявку."
    if holds == "TURNOVER":
        return "Баллы уже не мешают: сумму ограничивает оборот."
    if holds == "TIME_WINDOW":
        return "Главное ограничение снимется только со временем. Вот что можно сделать сейчас."
    if not reachable:
        return "Быстрого пути к этой сумме сейчас нет. Шаги ниже улучшат оценку, но порог пока не достигается."
    if turnover_bound:
        return "Шаги ниже снимают ограничения и поднимают оценку до порога; полную сумму после них ограничит оборот."
    return "Шаги ниже снимают ограничения и поднимают оценку до порога."
