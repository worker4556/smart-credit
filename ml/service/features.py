"""Признаки скоринга: входная схема, производные признаки и биннинг.

Один и тот же код используется при обучении (training/) и в сервисе,
поэтому модель и прод всегда считают признаки одинаково.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

# Базовые ставки продуктов (дублируют справочник backend, см. docs/api-contract.md).
PRODUCT_BASE_RATES = {
    "WORKING_CAPITAL": 18.0,
    "EQUIPMENT": 16.5,
    "OVERDRAFT": 20.0,
    "CREDIT_LINE": 17.5,
}
DEFAULT_RATE = 18.0
# Ставку, которую получит клиент, мы ещё не знаем, поэтому платёж
# оцениваем по базовой ставке с типичной надбавкой за риск.
RISK_RATE_BUFFER = 2.0

HIGH_RISK_OKVED = {"41", "42", "43", "55", "56", "68", "92"}
LOW_RISK_OKVED = {"62", "63", "69", "70", "71", "72", "85", "86"}


class ScoringFeatures(BaseModel):
    legal_form: Literal["IP", "OOO"]
    okved: str = Field(examples=["56.10"])
    company_age_months: int = Field(ge=0)
    annual_revenue: int = Field(ge=0)
    revenue_confirmed: bool = False
    requested_amount: int = Field(gt=0)
    term_months: int = Field(gt=0, le=120)
    product_code: str = "WORKING_CAPITAL"
    annual_rate: float | None = Field(default=None, description="Если не задано — базовая ставка продукта + буфер")
    active_loans_count: int = Field(default=0, ge=0)
    existing_monthly_payments: int = Field(default=0, ge=0)
    max_dpd_12m: int = Field(default=0, ge=0)
    overdue_count_12m: int = Field(default=0, ge=0)
    tax_debt: int = Field(default=0, ge=0)
    mass_address: bool = False


def annuity_payment(amount: float, annual_rate: float, term_months: int) -> float:
    r = annual_rate / 100 / 12
    if r == 0:
        return amount / term_months
    return amount * r / (1 - (1 + r) ** -term_months)


def industry_risk(okved: str) -> str:
    prefix = okved.split(".")[0][:2]
    if prefix in HIGH_RISK_OKVED:
        return "HIGH"
    if prefix in LOW_RISK_OKVED:
        return "LOW"
    return "MEDIUM"


def derive(f: ScoringFeatures) -> dict:
    """Сырые признаки → значения, которые идут в биннинг."""
    rate = f.annual_rate if f.annual_rate is not None else PRODUCT_BASE_RATES.get(f.product_code, DEFAULT_RATE) + RISK_RATE_BUFFER
    new_payment = annuity_payment(f.requested_amount, rate, f.term_months)
    monthly_revenue = f.annual_revenue / 12
    debt_burden = (f.existing_monthly_payments + new_payment) / monthly_revenue if monthly_revenue > 0 else 9.99
    amount_to_revenue = f.requested_amount / f.annual_revenue if f.annual_revenue > 0 else 9.99
    return {
        "company_age_months": f.company_age_months,
        "debt_burden": round(debt_burden, 4),
        "amount_to_revenue": round(amount_to_revenue, 4),
        "max_dpd_12m": f.max_dpd_12m,
        "overdue_count_12m": f.overdue_count_12m,
        "active_loans_count": f.active_loans_count,
        "tax_debt": f.tax_debt,
        "mass_address": f.mass_address,
        "revenue_confirmed": f.revenue_confirmed,
        "legal_form": f.legal_form,
        "industry_risk": industry_risk(f.okved),
        "_monthly_payment": round(new_payment),
        "_annual_rate": rate,
    }


@dataclass(frozen=True)
class Feature:
    name: str
    label: str
    kind: Literal["numeric", "category"]
    # numeric: правые границы бинов (значение < edge попадает в бин), последний бин — открытый
    edges: tuple[float, ...] = ()
    bin_labels: tuple[str, ...] = ()
    # category: допустимые значения
    categories: tuple = ()
    reference: str = ""  # бин с нулевыми баллами

    @property
    def bins(self) -> tuple[str, ...]:
        if self.kind == "numeric":
            return self.bin_labels
        return tuple(str(c) for c in self.categories)

    def bin_of(self, value) -> str:
        if self.kind == "category":
            return str(value)
        for edge, label in zip(self.edges, self.bin_labels):
            if value < edge:
                return label
        return self.bin_labels[-1]


FEATURES: tuple[Feature, ...] = (
    Feature("company_age_months", "Возраст бизнеса", "numeric",
            (6, 12, 24, 48), ("до 6 мес", "6–12 мес", "1–2 года", "2–4 года", "4+ лет"), reference="1–2 года"),
    Feature("debt_burden", "Долговая нагрузка (платежи / выручка в месяц)", "numeric",
            (0.15, 0.3, 0.45, 0.6), ("до 15%", "15–30%", "30–45%", "45–60%", "60%+"), reference="15–30%"),
    Feature("amount_to_revenue", "Сумма кредита к годовой выручке", "numeric",
            (0.1, 0.25, 0.5), ("до 10%", "10–25%", "25–50%", "50%+"), reference="10–25%"),
    Feature("max_dpd_12m", "Макс. просрочка за 12 мес", "numeric",
            (1, 31, 90), ("нет", "1–30 дн", "31–89 дн", "90+ дн"), reference="нет"),
    Feature("active_loans_count", "Активные кредиты", "numeric",
            (1, 3), ("нет", "1–2", "3+"), reference="1–2"),
    Feature("tax_debt", "Налоговая задолженность", "numeric",
            (1,), ("нет", "есть"), reference="нет"),
    Feature("mass_address", "Массовый адрес регистрации", "category",
            categories=(False, True), reference="False"),
    Feature("revenue_confirmed", "Выручка подтверждена выпиской", "category",
            categories=(False, True), reference="False"),
    Feature("legal_form", "Форма бизнеса", "category",
            categories=("IP", "OOO"), reference="OOO"),
    Feature("industry_risk", "Отраслевой риск", "category",
            categories=("LOW", "MEDIUM", "HIGH"), reference="MEDIUM"),
)

CATEGORY_TEXT = {
    "mass_address": {"False": "нет", "True": "да"},
    "revenue_confirmed": {"False": "нет", "True": "да"},
    "legal_form": {"IP": "ИП", "OOO": "ООО"},
    "industry_risk": {"LOW": "низкий", "MEDIUM": "средний", "HIGH": "высокий"},
}


def bin_label_text(feature: Feature, bin_key: str) -> str:
    return CATEGORY_TEXT.get(feature.name, {}).get(bin_key, bin_key)
