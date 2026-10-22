from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.applications import ActivityEvent, ApplicationResponse
from app.schemas.common import CamelModel


class BankQueueItem(CamelModel):
    application_id: str
    number: str
    company_name: str
    amount: int = Field(ge=0)
    triggers: list[str] = Field(default_factory=list)
    waiting_minutes: int = Field(ge=0)


class BankFactor(CamelModel):
    label: str
    points: int
    max_points: int = Field(ge=0)


class BankRecommendation(CamelModel):
    outcome: str
    amount: int | None = Field(default=None, ge=0)


class BankApplication(ApplicationResponse):
    factors: list[BankFactor] = Field(default_factory=list)
    stops: list[str] = Field(default_factory=list)
    limits: dict[str, int] = Field(default_factory=dict)
    recommendation: BankRecommendation
    events: list[ActivityEvent] = Field(default_factory=list)


class BankDecisionRequest(CamelModel):
    outcome: Literal["APPROVED", "COUNTER_OFFER", "INFO_REQUESTED", "REJECTED"]
    amount: int | None = Field(default=None, gt=0)
    term: int | None = Field(default=None, gt=0)
    reason_code: str = Field(min_length=1)
    comment: str = ""
