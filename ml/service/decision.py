"""Лимит по продукту, Б4 (решение по правилам), предложения и предоценка — одна модель для всех этапов."""
from __future__ import annotations

from .config import Policy
from .finance import cost, principal_for_payment, rate_for, round_down, term_of, weather
from .schemas import (AmountRange, Applicant, Decision, LimitResult, LoanRequest, Offer, Precheck, Reason, ScoreResult,
                      Specialist)
from .scoring import avg_turnover, score

LIMIT_REASON = {"TURNOVER": "L_TURNOVER", "DEBT": "B_DEBT_RATIO", "PAYMENT": "B_AMOUNT", "PRODUCT_MAX": "B_AMOUNT"}


# ---------- проверка запроса по параметрам продукта ----------

class RequestError(ValueError):
    """Запрос вне параметров продукта: сообщаем явно, а не обрезаем молча."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


def _rub(x: int) -> str:
    return f"{x:,}".replace(",", " ") + " ₽"


def validate_request(policy: Policy, req: LoanRequest) -> None:
    p = policy.products[req.product]
    if req.amount < p["min_amount"]:
        raise RequestError("amount", f"Минимальная сумма для продукта «{p['name']}» — {_rub(p['min_amount'])}")
    if req.product == "OVERDRAFT":
        if req.term_months is not None and req.term_months != p["term"]:
            raise RequestError("term_months", f"Овердрафт открывается на {p['term']} мес., срок выбирать не нужно")
    elif req.term_months is not None and not p["min_term"] <= req.term_months <= p["max_term"]:
        raise RequestError("term_months", f"Срок для продукта «{p['name']}»: от {p['min_term']} до {p['max_term']} мес.")


# ---------- лимит ----------

def limit(policy: Policy, a: Applicant, product: str | None = None, term_months: int | None = None) -> LimitResult:
    product = product or a.request.product
    p = policy.products[product]
    lc = p["limit"]
    t = avg_turnover(a)
    if product == "OVERDRAFT":
        comps = {"TURNOVER": t * lc["turnover_share"], "PRODUCT_MAX": p["max_amount"]}
    else:
        term = term_of(policy, product, term_months or a.request.term_months)
        payment_room = t * lc["payment_share"] - a.account.business_monthly_payments
        comps = {
            "TURNOVER": t * lc["turnover_multiple"],
            "DEBT": t * lc["debt_turnover_multiple"] - a.account.business_debt,
            "PAYMENT": principal_for_payment(payment_room, p["rate"], term),
            "PRODUCT_MAX": p["max_amount_with_guarantor"] if a.request.has_guarantor else p["max_amount"],
        }
    binding = min(comps, key=comps.get)
    return LimitResult(product=product, limit=round_down(comps[binding], lc["round_to"]), binding=binding,
                       components={k: round(max(v, 0)) for k, v in comps.items()})


def available_amount(policy: Policy, sc: ScoreResult, lim: LimitResult) -> int:
    """«Высота»: сколько можно получить сейчас при этих баллах (без учёта желаемой суммы)."""
    if sc.stops:
        return 0
    d = policy.decision
    if sc.score >= d["approve_score"]:
        return lim.limit
    for band in d["counter_bands"]:
        if sc.score >= band["min"]:
            return round_down(lim.limit * band["factor"], policy.products[lim.product]["limit"]["round_to"])
    return 0


# ---------- причины ----------

def reason(policy: Policy, code: str, shortfall: int | None = None) -> Reason:
    r = policy.reason(code)
    return Reason(code=code, kind=r["kind"], category=r["category"], text=r["text"], shortfall=shortfall)


def factor_reasons(policy: Policy, sc: ScoreResult, n: int | None = None) -> list[Reason]:
    """До N факторов с наибольшим недобором баллов."""
    n = n or policy.decision["max_reasons"]
    worst = sorted((f for f in sc.factors if f.shortfall > 0), key=lambda f: -f.shortfall)[:n]
    return [reason(policy, f.reason_code, f.shortfall) for f in worst]


def turnover_mismatch(policy: Policy, a: Applicant) -> bool:
    """Заявлено больше, чем видно банку: часть выручки идёт мимо счёта — её можно подтвердить выпиской.
    Если заявлено меньше, банк опирается на данные счёта и ничего не запрашивает."""
    declared = a.checks.declared_monthly_revenue
    t = avg_turnover(a)
    if not declared or t <= 0:
        return False
    return (declared - t) / t > policy.decision["turnover_mismatch"]


# ---------- решение (Б4) ----------

def decide(policy: Policy, a: Applicant, stage: str = "DECISION") -> Decision:
    """Порядок правил — спецификация, раздел 6. stage=PRECHECK пропускает 115-ФЗ и «нужны данные»."""
    req = a.request
    sc = score(policy, a)
    term = term_of(policy, req.product, req.term_months)
    d = policy.decision

    def result(outcome, amount=None, reasons=(), lim=None, term_=term) -> Decision:
        rate = rate_for(policy, req.product, sc.score)
        return Decision(policy_version=policy.version, outcome=outcome, requested_amount=req.amount,
                        amount=amount, term_months=term_ if amount else None,
                        cost=cost(policy, req.product, amount, term_, rate) if amount else None,
                        limit=lim, reasons=list(reasons), specialist=_specialist(policy, a, sc, outcome), score=sc,
                        weather=weather(policy, req.product, amount, term_, rate) if amount else None)

    if stage == "DECISION":
        # 1. 115-ФЗ — некредитная причина, маршрут не строится
        if a.company.zsk_level == "RED" or a.company.measures_115fz:
            return result("SUSPENDED_115FZ", reasons=[reason(policy, "Z_115")])
        # 2. Нужны данные
        if a.checks.missing_documents:
            return result("INFO_REQUESTED", reasons=[reason(policy, "D_DOC")])
        if turnover_mismatch(policy, a) and not a.checks.mismatch_unresolved:
            return result("INFO_REQUESTED", reasons=[reason(policy, "D_MISMATCH")])

    lim = limit(policy, a)
    # 3. Стоп-факторы
    if sc.stops:
        return result("REJECTED", reasons=[reason(policy, s.code) for s in sc.stops] + factor_reasons(policy, sc), lim=lim)
    # 4–6. Баллы и лимит
    avail = available_amount(policy, sc, lim)
    p = policy.products[req.product]
    if sc.score >= d["approve_score"] and lim.limit >= req.amount:
        return result("APPROVED", req.amount, factor_reasons(policy, sc), lim)
    if avail <= 0:
        return result("REJECTED", reasons=factor_reasons(policy, sc), lim=lim)
    # 5. Иные условия: другой срок даёт всю сумму, иначе — меньшая сумма
    if sc.score >= d["approve_score"] and lim.binding == "PAYMENT" and req.product == "WORKING_CAPITAL":
        alt = _term_for_amount(policy, a, req.amount)
        if alt:
            return result("COUNTER_OFFER", req.amount, [reason(policy, "B_AMOUNT")], lim, term_=alt)
    amount = min(req.amount, avail)
    if amount < p["min_amount"]:
        return result("REJECTED", reasons=factor_reasons(policy, sc), lim=lim)
    reasons = factor_reasons(policy, sc)
    if sc.score >= d["approve_score"]:
        reasons = [reason(policy, LIMIT_REASON[lim.binding])] + reasons
    else:
        # Полоса 50–69: иные условия всегда отличаются от запроса — как минимум ценой риска
        reasons = [reason(policy, "R_RISK_PRICE")] + reasons
    return result("COUNTER_OFFER", amount, reasons[: d["max_reasons"]], lim)


def _term_for_amount(policy: Policy, a: Applicant, amount: int) -> int | None:
    p = policy.products["WORKING_CAPITAL"]
    for term in range((a.request.term_months or p["min_term"]) + 1, p["max_term"] + 1):
        if limit(policy, a, "WORKING_CAPITAL", term).limit >= amount:
            return term
    return None


def _specialist(policy: Policy, a: Applicant, sc: ScoreResult, outcome: str) -> Specialist:
    if outcome in ("SUSPENDED_115FZ", "INFO_REQUESTED"):
        return Specialist(required=False, triggers=[])
    sp = policy.decision["specialist"]
    triggers = []
    if a.request.amount > sp["amount_above"]:
        triggers.append("AMOUNT_ABOVE_2M")
    if not sc.stops and sp["score_band"]["min"] <= sc.score <= sp["score_band"]["max"]:
        triggers.append("BORDERLINE_SCORE")
    if a.checks.mismatch_unresolved:
        triggers.append("MISMATCH_UNRESOLVED")
    if a.checks.disputed:
        triggers.append("CLIENT_DISPUTE")
    return Specialist(required=bool(triggers), triggers=triggers)


# ---------- предложения (шаг 4) ----------

def offers(policy: Policy, a: Applicant, dec: Decision) -> list[Offer]:
    """1–3 варианта: запрошенная сумма, в пределах оценки, другой срок или продукт."""
    req = a.request
    out: list[Offer] = []

    def add(kind, product, amount, term):
        if amount and all((o.product, o.amount, o.term_months) != (product, amount, term) for o in out):
            rate = rate_for(policy, product, dec.score.score)
            out.append(Offer(kind=kind, product=product, amount=amount, term_months=term,
                             cost=cost(policy, product, amount, term, rate),
                             weather=weather(policy, product, amount, term, rate)))

    term = term_of(policy, req.product, req.term_months)
    if dec.outcome == "APPROVED":
        add("REQUESTED", req.product, req.amount, term)
    elif dec.outcome == "COUNTER_OFFER" and dec.amount:
        kind = "OTHER_TERM" if dec.term_months != term else "WITHIN_ESTIMATE"
        add(kind, req.product, dec.amount, dec.term_months)
        if req.product == "WORKING_CAPITAL" and kind == "WITHIN_ESTIMATE":
            alt = _term_for_amount(policy, a, req.amount)
            if alt and not dec.score.stops and dec.score.score >= policy.decision["approve_score"]:
                add("OTHER_TERM", req.product, req.amount, alt)
    if dec.outcome in ("APPROVED", "COUNTER_OFFER"):
        other = "OVERDRAFT" if req.product == "WORKING_CAPITAL" else "WORKING_CAPITAL"
        sc = score(policy, a)
        avail = available_amount(policy, sc, limit(policy, a, other))
        if avail >= policy.products[other]["min_amount"] and other == "WORKING_CAPITAL":
            add("OTHER_PRODUCT", other, min(req.amount, avail), term_of(policy, other, 12))
    return out[:3]


# ---------- предоценка (шаг 3) ----------

CHANCE = {"APPROVED": "HIGH", "COUNTER_OFFER": "MEDIUM", "REJECTED": "LOW"}


def precheck(policy: Policy, a: Applicant) -> Precheck:
    """Без заявки и без БКИ: данные владельца — со слов клиента."""
    pc = policy.precheck
    dec = decide(policy, a, stage="PRECHECK")
    sc = dec.score
    lim = dec.limit or limit(policy, a)
    high = available_amount(policy, sc, lim)
    low = round_down(high * (1 - pc["range_discount"]), policy.products[a.request.product]["limit"]["round_to"])
    reasons = dec.reasons
    if turnover_mismatch(policy, a):
        reasons = [reason(policy, "D_MISMATCH")] + reasons
    note = "Кредитную историю проверим после подачи — результат может измениться." \
        if a.owner.source == "SELF_REPORTED" else None
    rate = rate_for(policy, a.request.product, sc.score)
    return Precheck(policy_version=policy.version, chance=CHANCE[dec.outcome], expected_outcome=dec.outcome,
                    score=sc.score, amount_range=AmountRange(low=low, high=high), requested_amount=a.request.amount,
                    cost=cost(policy, a.request.product, a.request.amount, a.request.term_months, rate),
                    weather=weather(policy, a.request.product, a.request.amount, a.request.term_months, rate),
                    reasons=reasons[: policy.decision["max_reasons"] + len(sc.stops)],
                    offers=offers(policy, a, dec), owner_note=note, valid_days=pc["valid_days"],
                    disclaimer=pc["disclaimer"])
