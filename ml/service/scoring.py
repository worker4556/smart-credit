"""Б3. Скоринг: баллы по 9 факторам и стоп-факторы. Детерминированно, по policy.yaml."""
from __future__ import annotations

import statistics

from .config import Policy
from .schemas import Applicant, FactorScore, ScoreResult, Stop

WINDOW = 6  # оборот и регулярность считаем по последним 6 месяцам


def effective_turnover(a: Applicant) -> list[int]:
    """Подтверждённые поступления: счёт в Альфе + выписка другого банка, последние 6 месяцев."""
    own = a.account.turnover_monthly[-WINDOW:]
    ext = (a.account.external_turnover_monthly or [])[-WINDOW:]
    ext = [0] * (len(own) - len(ext)) + ext if len(ext) < len(own) else ext[-len(own):]
    return [o + e for o, e in zip(own, ext)]


def avg_turnover(a: Applicant) -> float:
    series = effective_turnover(a)
    return sum(series) / len(series)


def turnover_cv(a: Applicant) -> float:
    series = effective_turnover(a)
    mean = sum(series) / len(series)
    if mean <= 0:
        return float("inf")
    return statistics.pstdev(series) / mean if len(series) > 1 else 0.0


def _bin(bins: list[dict], value: float) -> int:
    for b in bins:
        if "max" in b and value <= b["max"]:
            return int(b["points"])
        if "min" in b and value >= b["min"]:
            return int(b["points"])
    return 0


def industry_group(policy: Policy, okved: str) -> str:
    best, group = -1, policy.industries["default"]
    for prefix, g in policy.industries["prefixes"].items():
        if okved.startswith(prefix) and len(prefix) > best:
            best, group = len(prefix), g
    return group


def _ratio(num: float, den: float) -> float:
    return num / den if den > 0 else float("inf")


def factor_values(policy: Policy, a: Applicant, amount: int | None = None) -> dict[str, tuple[object, int]]:
    """factor → (значение метрики, баллы)."""
    f = policy.factors
    t = avg_turnover(a)
    amount = amount if amount is not None else a.request.amount
    out: dict[str, tuple[object, int]] = {}

    cv = turnover_cv(a)
    out["turnover_regularity"] = (round(cv, 3), _bin(f["turnover_regularity"]["bins"], cv))
    debt = _ratio(a.account.business_monthly_payments, t) if a.account.business_monthly_payments else 0.0
    out["debt_load"] = (round(debt, 3), _bin(f["debt_load"]["bins"], debt))
    out["business_age"] = (a.company.business_age_months, _bin(f["business_age"]["bins"], a.company.business_age_months))
    ratio = _ratio(amount, t)
    out["amount_to_turnover"] = (round(ratio, 2), _bin(f["amount_to_turnover"]["bins"], ratio))
    group = industry_group(policy, a.company.okved)
    out["industry"] = (group, int(f["industry"]["groups"].get(group, 0)))
    out["courts"] = (a.company.fssp_debt, _bin(f["courts"]["bins"], a.company.fssp_debt))
    out["rko_tenure"] = (a.account.rko_months, _bin(f["rko_tenure"]["bins"], a.account.rko_months))

    oh = f["owner_history"]
    if a.owner.source == "SELF_REPORTED":
        hist = oh["self_reported_overdue_points"] if a.owner.had_overdue_2y else oh["max_points"]
        out["owner_history"] = ("со слов клиента", int(hist))
    else:
        out["owner_history"] = (a.owner.max_dpd_24m, _bin(oh["bins"], a.owner.max_dpd_24m))

    pl = f["personal_load"]
    personal = _ratio(a.owner.personal_monthly_payments, t) if a.owner.personal_monthly_payments else 0.0
    pts = _bin(pl["bins"], personal)
    if a.owner.card_utilization is not None and a.owner.card_utilization >= pl["card_utilization_limit"]:
        pts = max(0, pts - int(pl["card_utilization_penalty"]))
    out["personal_load"] = (round(personal, 3), pts)
    return out


def stops(policy: Policy, a: Applicant) -> list[Stop]:
    s = policy.stops
    out: list[Stop] = []

    def add(code: str, **kw) -> None:
        r = policy.reason(code)
        out.append(Stop(code=code, text=r["text"], permanent=bool(r.get("permanent")), **kw))

    c = a.company
    if c.status != "ACTIVE":
        add("S_INACTIVE")
    if c.bankruptcy:
        add("S_BANKRUPTCY")
    if industry_group(policy, c.okved) == "FORBIDDEN":
        add("S_INDUSTRY")
    if c.tax_debt > s["tax_debt_threshold"]:
        add("S_TAX")
    if c.fns_blocked:
        add("S_FNS_BLOCK")
    if c.recovery_lawsuit:
        add("S_LAWSUIT")
    if c.business_age_months < s["min_business_age_months"]:
        add("S_AGE", months_to_clear=float(s["min_business_age_months"] - c.business_age_months))
    if a.owner.source == "BKI":
        if a.owner.current_overdue:
            add("S_OVERDUE")
        m = a.owner.months_since_90plus
        if m is not None and m < s["overdue_90_window_months"]:
            add("S_90_12", months_to_clear=float(s["overdue_90_window_months"] - m))
    return out


def score(policy: Policy, a: Applicant, amount: int | None = None) -> ScoreResult:
    values = factor_values(policy, a, amount)
    factors = []
    for name, (value, pts) in values.items():
        cfg = policy.factors[name]
        factors.append(FactorScore(factor=name, label=cfg["label"], layer=cfg["layer"], reason_code=cfg["reason"],
                                   value=value if value != float("inf") else None, points=pts,
                                   max_points=cfg["max_points"], shortfall=cfg["max_points"] - pts))
    return ScoreResult(policy_version=policy.version, score=sum(f.points for f in factors), owner_source=a.owner.source,
                       factors=factors, stops=stops(policy, a), turnover_monthly_avg=round(avg_turnover(a)))
