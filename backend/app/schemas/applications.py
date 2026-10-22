from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import AliasChoices, Field

from app.schemas.common import CamelModel

ProductCode = Literal["WORKING_CAPITAL", "OVERDRAFT"]
Chance = Literal["HIGH", "MEDIUM", "LOW"]
Outcome = Literal[
    "review",
    "specialist",
    "approved",
    "partial",
    "info",
    "rejected",
    "suspended",
]
Status = Literal[
    "DRAFT",
    "SUBMITTED",
    "IN_REVIEW",
    "INFO_REQUESTED",
    "SPECIALIST_REVIEW",
    "APPROVED",
    "COUNTER_OFFER",
    "OFFER_ACCEPTED",
    "SIGNED",
    "DISBURSED",
    "REJECTED",
    "DECLINED_BY_CLIENT",
    "WITHDRAWN",
    "EXPIRED",
    "SUSPENDED_115FZ",
]
RouteStatus = Literal["ACTIVE", "READY", "NO_ROUTE"]
RouteHold = Literal[
    "NONE",
    "SCORE",
    "STOP",
    "TIME_WINDOW",
    "TURNOVER",
    "STOP_PERMANENT",
    "NONCREDIT",
]
AssistantSource = Literal["TEMPLATE", "LLM"]
AssistantTopic = Literal[
    "WHY",
    "WHAT_TO_DO",
    "WHEN",
    "TERM",
    "AMOUNT",
    "OFF_TOPIC",
    "NONCREDIT",
    "NOT_NEEDED",
]
IntentSource = Literal["LLM", "RULES"]

OUTCOME_BY_STATUS: dict[str, Outcome] = {
    "DRAFT": "review",
    "SUBMITTED": "review",
    "IN_REVIEW": "review",
    "SPECIALIST_REVIEW": "specialist",
    "APPROVED": "approved",
    "OFFER_ACCEPTED": "approved",
    "SIGNED": "approved",
    "DISBURSED": "approved",
    "COUNTER_OFFER": "partial",
    "INFO_REQUESTED": "info",
    "REJECTED": "rejected",
    "DECLINED_BY_CLIENT": "rejected",
    "WITHDRAWN": "rejected",
    "EXPIRED": "rejected",
    "SUSPENDED_115FZ": "suspended",
}


class ApplicationData(CamelModel):
    goal: str = Field(min_length=1)
    amount: int = Field(gt=0)
    term: int = Field(gt=0)
    monthly_revenue: int = Field(ge=0)
    has_loans: Literal["Да", "Нет"]
    loan_payment: int = Field(ge=0)
    had_overdue_2y: bool = Field(alias="hadOverdue2y")
    collateral: str = ""
    consent1: bool = False
    consent2: bool = False
    docs: dict[str, str] = Field(default_factory=dict)


class IntentRequest(CamelModel):
    text: str = Field(min_length=1, max_length=500)


class IntentResponse(CamelModel):
    goal: str | None = None
    amount: int | None = Field(default=None, gt=0)
    term: int | None = Field(default=None, gt=0)
    missing: list[Literal["goal", "amount", "term"]] = Field(default_factory=list)
    product_reason: str | None = None
    needs_confirmation: bool = True
    source: IntentSource


class QuoteRequest(CamelModel):
    goal: str = Field(min_length=1)
    amount: int = Field(gt=0)
    term: int | None = Field(default=None, gt=0)


class Quote(CamelModel):
    monthly: int = Field(ge=0)
    total: int = Field(ge=0)
    full_cost: int = Field(ge=0)
    rate: float = Field(ge=0)
    term_months: int = Field(gt=0)
    disclaimer: str


class WeatherRow(CamelModel):
    code: Literal["BASE", "RATE_UP", "OVERDUE_30"]
    title: str
    rate: float = Field(ge=0)
    monthly_payment: int = Field(ge=0)
    full_cost: int = Field(ge=0)
    delta_full_cost: int = 0
    note: str | None = None


class Weather(CamelModel):
    rows: list[WeatherRow] = Field(default_factory=list)
    disclaimer: str


class Reason(CamelModel):
    code: str
    text: str


class LoanOffer(CamelModel):
    product: ProductCode
    name: str
    amount: int = Field(gt=0)
    term_months: int = Field(gt=0)
    rate: float = Field(ge=0)
    monthly: int = Field(ge=0)
    full_cost: int = Field(ge=0)
    why: str | None = None
    chance: Chance
    weather: Weather | None = None


class PrecheckResponse(CamelModel):
    chance: Chance
    amount_low: int = Field(ge=0)
    amount_high: int = Field(ge=0)
    requested_amount: int = Field(gt=0)
    reasons: list[Reason] = Field(default_factory=list)
    text: str
    owner_note: str | None = None
    disclaimer: str
    valid_until: date
    weather: Weather | None = None
    goal_offers: list[LoanOffer] = Field(default_factory=list)


class InfoRequest(CamelModel):
    text: str
    due_date: date


class ActivityEvent(CamelModel):
    at: str
    text: str


class ApplicationResponse(CamelModel):
    application_id: str = Field(min_length=1)
    number: str
    status: Status
    outcome: Outcome
    submitted: bool = False
    next_action: str | None = None
    decision_text: str | None = None
    decision_amount: int | None = Field(default=None, ge=0)
    decision_term: int | None = Field(default=None, gt=0)
    decision_rate: float | None = Field(default=None, ge=0)
    decision_monthly: int | None = Field(default=None, ge=0)
    decision_full_cost: int | None = Field(default=None, ge=0)
    decision_weather: Weather | None = None
    reasons: list[str] = Field(default_factory=list)
    info_request: InfoRequest | None = None
    route_available: bool = False
    assistant_available: bool = False
    activity: list[ActivityEvent] = Field(default_factory=list)


class RouteStep(CamelModel):
    code: str
    action: str
    term: str
    points_gain: int = 0
    done: bool = False
    bki_delay_business_days: int | None = None


class ApplicationRoute(CamelModel):
    status: RouteStatus
    holds: RouteHold
    based_on: Literal["SYSTEM", "SPECIALIST"] = "SYSTEM"
    steps: list[RouteStep] = Field(default_factory=list)
    horizon_text: str
    message: str
    advice: list[str] = Field(default_factory=list)
    projected_amount: int | None = Field(default=None, ge=0)
    disclaimer: str
    text: str


class AcceptOfferRequest(CamelModel):
    amount: int | None = Field(default=None, gt=0)
    term: int | None = Field(default=None, gt=0)


class RouteRecalculateRequest(CamelModel):
    done_steps: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("doneSteps", "done", "done_steps"),
    )


class AssistantRequest(CamelModel):
    question: str = Field(min_length=1, max_length=500)
    use_llm: bool = True


class AssistantAnswer(CamelModel):
    answer: str
    source: AssistantSource
    topic: AssistantTopic
    terms: list[str] = Field(default_factory=list)
