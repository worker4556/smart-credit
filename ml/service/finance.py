"""Стоимость продуктов в рублях: аннуитет оборотного кредита и проценты овердрафта."""
from __future__ import annotations

import math

from .config import Policy
from .schemas import Cost, PaymentRow, Quote, Weather, WeatherRow


def annuity(principal: float, annual_rate: float, months: int) -> float:
    r = annual_rate / 100 / 12
    return principal * r / (1 - (1 + r) ** -months)


def principal_for_payment(payment: float, annual_rate: float, months: int) -> float:
    """Максимальная сумма кредита, при которой аннуитет не превышает payment."""
    if payment <= 0:
        return 0.0
    r = annual_rate / 100 / 12
    return payment * (1 - (1 + r) ** -months) / r


def round_down(x: float, step: int) -> int:
    return int(math.floor(max(x, 0) / step) * step)


def term_of(policy: Policy, product: str, term_months: int | None) -> int:
    p = policy.products[product]
    if product == "OVERDRAFT":
        return int(p["term"])
    term = term_months or p["max_term"]
    return max(p["min_term"], min(term, p["max_term"]))


def rate_for(policy: Policy, product: str, score: int | None = None) -> float:
    """Ставка с учётом оценки: базовая от порога одобрения, ниже — надбавка полосы «иных условий»."""
    base = float(policy.products[product]["rate"])
    d = policy.decision
    if score is None or score >= d["approve_score"]:
        return base
    for band in d["counter_bands"]:
        if score >= band["min"]:
            return base + float(band.get("rate_add", 0))
    return base


def cost(policy: Policy, product: str, amount: int, term_months: int | None, rate: float | None = None) -> Cost:
    p = policy.products[product]
    term = term_of(policy, product, term_months)
    rate = float(p["rate"]) if rate is None else rate
    fee = round(amount * p["fee_percent"] / 100)
    if product == "WORKING_CAPITAL":
        pay = annuity(amount, rate, term)
        # Полная стоимость = платежи за срок − тело + комиссия (от неокруглённого платежа, как в спецификации)
        return Cost(product=product, amount=amount, term_months=term, rate=rate,
                    monthly_payment=round(pay), fee=fee, full_cost=round(pay * term - amount + fee))
    monthly = amount * rate / 100 * p["days_in_month"] / 365
    yearly = amount * rate / 100
    return Cost(product=product, amount=amount, term_months=term, rate=rate,
                monthly_payment=round(monthly), fee=fee, full_cost=round(yearly + fee))


def quote(policy: Policy, product: str, amount: int, term_months: int | None) -> Quote:
    """Калькулятор для ползунков: платёж, переплата, полная стоимость и график — без скоринга."""
    c = cost(policy, product, amount, term_months)
    p = policy.products[product]
    if product == "OVERDRAFT":
        interest = c.full_cost - c.fee
        return Quote(product=product, amount=amount, term_months=c.term_months, rate=c.rate,
                     monthly_payment=c.monthly_payment, total_paid=amount + interest, interest=interest, fee=c.fee,
                     full_cost=c.full_cost, schedule=[],
                     note="Проценты начисляются только на использованную сумму; расчёт — при полном использовании лимита.")
    r = p["rate"] / 100 / 12
    pay = annuity(amount, p["rate"], c.term_months)
    balance, rows = float(amount), []
    for m in range(1, c.term_months + 1):
        interest_m = balance * r
        principal_m = pay - interest_m
        balance = max(balance - principal_m, 0.0)
        rows.append(PaymentRow(month=m, payment=round(pay), principal=round(principal_m),
                               interest=round(interest_m), balance=round(balance)))
    interest = c.full_cost - c.fee
    return Quote(product=product, amount=amount, term_months=c.term_months, rate=c.rate,
                 monthly_payment=c.monthly_payment, total_paid=amount + interest, interest=interest, fee=c.fee,
                 full_cost=c.full_cost, schedule=rows, note="Расчёт предварительный, по демо-ставке. Это не оферта.")


def weather(policy: Policy, product: str, amount: int, term_months: int | None, rate: float | None = None) -> Weather:
    """«Погода»: сейчас / ставка выше на rate_up_pp / задержка платежа на overdue_days с пени."""
    w = policy.raw["weather"]
    base = cost(policy, product, amount, term_months, rate)
    up = cost(policy, product, amount, term_months, base.rate + float(w["rate_up_pp"]))
    overdue_sum = base.monthly_payment if product == "WORKING_CAPITAL" else amount
    penalty = round(overdue_sum * float(w["penalty_per_day"]) * int(w["overdue_days"]))

    def row(code: str, c: Cost, full: int, note: str | None = None) -> WeatherRow:
        title = w["titles"][code].format(rate_up_pp=float(w["rate_up_pp"]), overdue_days=int(w["overdue_days"]))
        return WeatherRow(code=code, title=title, rate=c.rate, monthly_payment=c.monthly_payment,
                          full_cost=full, delta_full_cost=full - base.full_cost, note=note)

    return Weather(rows=[row("BASE", base, base.full_cost), row("RATE_UP", up, up.full_cost),
                         row("OVERDUE_30", base, base.full_cost + penalty, w["overdue_note"])],
                   disclaimer=w["disclaimer"])
