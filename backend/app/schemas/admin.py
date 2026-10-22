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
