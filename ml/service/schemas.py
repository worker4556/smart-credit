"""Входные и выходные схемы движка. Входные данные собирает backend из моков источников и ответов клиента."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ProductCode = Literal["WORKING_CAPITAL", "OVERDRAFT"]
Outcome = Literal["APPROVED", "COUNTER_OFFER", "INFO_REQUESTED", "REJECTED", "SUSPENDED_115FZ"]
Chance = Literal["HIGH", "MEDIUM", "LOW"]


# ---------- вход ----------

class LoanRequest(BaseModel):
    product: ProductCode
    amount: int = Field(gt=0, description="Желаемая сумма («вершина»), ₽")
    term_months: int | None = Field(default=None, ge=1, le=60, description="Для овердрафта не нужен — 12 мес")
    has_guarantor: bool = Field(default=False, description="Владелец — поручитель (для ООО)")


class Company(BaseModel):
    legal_form: Literal["IP", "OOO"]
    okved: str = Field(examples=["56.10"])
    status: Literal["ACTIVE", "LIQUIDATING", "LIQUIDATED"] = Field(default="ACTIVE", description="ЕГРЮЛ/ЕГРИП")
    business_age_months: int = Field(ge=0)
    tax_debt: int = Field(default=0, ge=0, description="ФНС «Прозрачный бизнес», ₽")
    fns_blocked: bool = False
    bankruptcy: bool = False
    recovery_lawsuit: bool = Field(default=False, description="Иск о взыскании (арбитраж)")
    fssp_debt: int = Field(default=0, ge=0, description="Открытые исполнительные производства, ₽")
    zsk_level: Literal["GREEN", "YELLOW", "RED"] | None = Field(default=None, description="Известен только после подачи (Б2)")
    measures_115fz: bool = False


class Account(BaseModel):
    turnover_monthly: list[int] = Field(min_length=1, max_length=12,
                                        description="Чистые поступления по счёту в Альфе по месяцам, от старых к новым")
    rko_months: int = Field(ge=0, description="Сколько месяцев счёт в Альфе")
    business_debt: int = Field(default=0, ge=0, description="Текущий долг бизнеса по кредитам, ₽")
    business_monthly_payments: int = Field(default=0, ge=0)
    external_turnover_monthly: list[int] | None = Field(
        default=None, max_length=12, description="Поступления по выписке другого банка (подтверждённые), по месяцам")


class Owner(BaseModel):
    source: Literal["SELF_REPORTED", "BKI"] = Field(description="До подачи — со слов клиента, после Б2 — из БКИ")
    had_overdue_2y: bool | None = Field(default=None, description="Ответ клиента: были ли просрочки за 2 года")
    current_overdue: bool = False
    max_dpd_24m: int = Field(default=0, ge=0, description="Макс. просрочка за 24 мес, дней (БКИ)")
    months_since_90plus: int | None = Field(default=None, ge=0,
                                            description="Сколько месяцев назад закрыт последний эпизод 90+ (БКИ)")
    personal_monthly_payments: int = Field(default=0, ge=0)
    card_utilization: float | None = Field(default=None, ge=0, le=5, description="Использование лимитов кредиток, доля")


class Checks(BaseModel):
    declared_monthly_revenue: int | None = Field(default=None, ge=0, description="Выручка в месяц со слов клиента")
    missing_documents: list[str] = []
    mismatch_unresolved: bool = Field(default=False, description="Расхождение не устранено после одного запроса")
    disputed: bool = Field(default=False, description="Клиент нажал «Не согласен с причиной»")


class Applicant(BaseModel):
    request: LoanRequest
    company: Company
    account: Account
    owner: Owner
    checks: Checks = Checks()


# ---------- выход ----------

class FactorScore(BaseModel):
    factor: str
    label: str
    layer: Literal["BUSINESS", "OWNER"]
    reason_code: str
    value: float | int | str | None
    points: int
    max_points: int
    shortfall: int


class Stop(BaseModel):
    code: str
    text: str
    permanent: bool = False
    months_to_clear: float | None = Field(default=None, description="Для временных окон: сколько ждать")


class ScoreResult(BaseModel):
    policy_version: str
    score: int
    max_score: int = 100
    owner_source: str
    factors: list[FactorScore]
    stops: list[Stop]
    turnover_monthly_avg: int = Field(description="Средний подтверждённый оборот за 6 мес, ₽")


class Cost(BaseModel):
    product: ProductCode
    amount: int
    term_months: int
    rate: float
    monthly_payment: int = Field(description="Кредит — аннуитет; овердрафт — проценты за месяц при полном использовании")
    fee: int
    full_cost: int = Field(description="Полная стоимость в рублях: проценты + комиссия (для овердрафта — за год)")


class PaymentRow(BaseModel):
    month: int
    payment: int
    principal: int
    interest: int
    balance: int


class Quote(BaseModel):
    product: ProductCode
    amount: int
    term_months: int
    rate: float
    monthly_payment: int = Field(description="Кредит — аннуитет; овердрафт — проценты за месяц при полном использовании")
    total_paid: int = Field(description="Всего вернёте банку (для овердрафта — за год при полном использовании)")
    interest: int
    fee: int
    full_cost: int = Field(description="Полная стоимость в рублях: проценты + комиссия")
    schedule: list[PaymentRow] = Field(description="График платежей; для овердрафта пустой")
    note: str


class LimitResult(BaseModel):
    product: ProductCode
    limit: int
    binding: Literal["TURNOVER", "DEBT", "PAYMENT", "PRODUCT_MAX"]
    components: dict[str, int]


class Reason(BaseModel):
    code: str
    kind: str
    category: str
    text: str
    shortfall: int | None = None


class Offer(BaseModel):
    kind: Literal["REQUESTED", "WITHIN_ESTIMATE", "OTHER_TERM", "OTHER_PRODUCT"]
    product: ProductCode
    amount: int
    term_months: int
    cost: Cost


class Specialist(BaseModel):
    required: bool
    triggers: list[str]


class Decision(BaseModel):
    policy_version: str
    outcome: Outcome
    requested_amount: int
    amount: int | None
    term_months: int | None
    cost: Cost | None
    limit: LimitResult | None
    reasons: list[Reason]
    specialist: Specialist
    score: ScoreResult


class AmountRange(BaseModel):
    low: int
    high: int


class Precheck(BaseModel):
    policy_version: str
    chance: Chance
    expected_outcome: Outcome
    score: int
    amount_range: AmountRange = Field(description="«Высота» — вилка доступной суммы")
    requested_amount: int = Field(description="«Вершина»")
    cost: Cost | None = Field(description="Полная стоимость на запрошенную сумму")
    reasons: list[Reason]
    offers: list[Offer]
    owner_note: str | None
    valid_days: int
    disclaimer: str
