from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import Session, select

from app.db.models import Application, ApplicationEvent, utcnow


def next_number(session: Session) -> str:
    count = len(session.exec(select(Application)).all())
    return f"A-{count + 1:06d}"


def change_status(
    session: Session,
    app: Application,
    to_status: str,
    *,
    actor: str = "system",
    reason: str | None = None,
    payload: dict[str, Any] | None = None,
) -> ApplicationEvent:
    event = ApplicationEvent(
        application_id=app.id,
        from_status=app.status,
        to_status=to_status,
        actor=actor,
        reason=reason,
        payload=payload,
    )
    app.status = to_status
    app.updated_at = utcnow()
    app.version += 1
    session.add(event)
    session.add(app)
    return event


def get_application(session: Session, application_id: uuid.UUID) -> Application | None:
    return session.get(Application, application_id)
