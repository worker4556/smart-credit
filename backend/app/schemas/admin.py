from __future__ import annotations

from pydantic import Field

from app.schemas.common import CamelModel


class AdminApplication(CamelModel):
    application_id: str
    number: str
    company_name: str
    amount: int = Field(ge=0)
    status: str
    outcome: str
    decided_by: str | None = None


class AdminLLM(CamelModel):
    enabled: bool = False
    ready: bool = False
    model: str | None = None


class AdminSystem(CamelModel):
    backend: str = "ok"
    ml: str
    llm: AdminLLM = Field(default_factory=AdminLLM)
    policy_version: str | None = None


class FunnelStats(CamelModel):
    drafts: int = 0
    submitted: int = 0
    decided: int = 0
    issued: int = 0


class ReasonCount(CamelModel):
    text: str
    count: int


class AdminStats(CamelModel):
    """Эффект продукта: только по событиям заявок в базе (docs/05-ux/route-pages.md, раздел 8)."""
    funnel: FunnelStats
    outcomes: dict[str, int]
    auto_decision_share: int | None = None
    fill_minutes_median: float | None = None
    decision_minutes_median: float | None = None
    top_reasons: list[ReasonCount] = []
    refused: int = 0
    returned_after_refusal_share: int | None = None
    precheck_match_share: int | None = None
    precheck_compared: int = 0
