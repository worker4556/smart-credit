from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    login: str = Field(unique=True, index=True)
    password_hash: str
    role: str = Field(index=True)  # client | specialist | admin
    name: str
    created_at: datetime = Field(default_factory=utcnow)


class Company(SQLModel, table=True):
    __tablename__ = "companies"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    inn: str = Field(unique=True, index=True)
    name: str
    persona_key: str = Field(index=True)  # P1 | P2 | P3 | P4 | P5 | ZSK
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    created_at: datetime = Field(default_factory=utcnow)


class Application(SQLModel, table=True):
    __tablename__ = "applications"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    number: str = Field(unique=True, index=True)
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True)
    status: str = Field(default="DRAFT", index=True)
    version: int = Field(default=1)

    data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
    )

    statement_uploaded: bool = Field(default=False)
    info_requests: int = Field(default=0)

    precheck: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    decision: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    decision_text: Optional[str] = Field(default=None)
    route: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    route_text: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ApplicationEvent(SQLModel, table=True):
    __tablename__ = "application_events"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    application_id: uuid.UUID = Field(foreign_key="applications.id", index=True)
    from_status: Optional[str] = Field(default=None)
    to_status: str
    actor: str
    reason: Optional[str] = Field(default=None)
    payload: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    at: datetime = Field(default_factory=utcnow)