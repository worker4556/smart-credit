"""Стоимость продуктов в рублях: аннуитет оборотного кредита и проценты овердрафта."""
from __future__ import annotations

import math

from .config import Policy
from .schemas import Cost, PaymentRow, Quote


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


def cost(policy: Policy, product: str, amount: int, term_months: int | None) -> Cost:
    p = policy.products[product]
    term = term_of(policy, product, term_months)
    fee = round(amount * p["fee_percent"] / 100)
    if product == "WORKING_CAPITAL":
        pay = annuity(amount, p["rate"], term)
        # Полная стоимость = платежи за срок − тело + комиссия (от неокруглённого платежа, как в спецификации)
        return Cost(product=product, amount=amount, term_months=term, rate=p["rate"],
                    monthly_payment=round(pay), fee=fee, full_cost=round(pay * term - amount + fee))
    monthly = amount * p["rate"] / 100 * p["days_in_month"] / 365
    yearly = amount * p["rate"] / 100
    return Cost(product=product, amount=amount, term_months=term, rate=p["rate"],
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
