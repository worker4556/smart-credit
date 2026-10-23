"""Статистика продукта считается по событиям одинаково для всех заявок."""
import uuid
from datetime import datetime, timedelta, timezone

from app.db.models import Application, ApplicationEvent
from app.services.stats import compute

T0 = datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc)


def app(status: str, company=None, created=T0, **kw) -> Application:
    return Application(id=uuid.uuid4(), number=f"A-{uuid.uuid4().hex[:6]}", company_id=company or uuid.uuid4(),
                       status=status, data={}, created_at=created, **kw)


def ev(a: Application, to: str, minutes: float, actor: str = "system") -> ApplicationEvent:
    return ApplicationEvent(application_id=a.id, to_status=to, actor=actor, at=T0 + timedelta(minutes=minutes))


def test_funnel_outcomes_and_times():
    approved = app("DISBURSED", precheck={"ml": {"expected_outcome": "APPROVED"}})
    manual = app("COUNTER_OFFER")
    refused = app("REJECTED", decision={"reasons": [{"code": "S_TAX", "text": "Налоговая задолженность"}]},
                  route={"status": "READY"})
    draft = app("DRAFT")
    events = [
        ev(approved, "SUBMITTED", 4, "CLIENT"), ev(approved, "APPROVED", 5), ev(approved, "DISBURSED", 9, "system"),
        ev(manual, "SUBMITTED", 6, "CLIENT"), ev(manual, "SPECIALIST_REVIEW", 7), ev(manual, "COUNTER_OFFER", 30, "SPECIALIST"),
        ev(refused, "SUBMITTED", 2, "CLIENT"), ev(refused, "REJECTED", 3),
    ]
    s = compute([approved, manual, refused, draft], events)
    assert s["funnel"] == {"drafts": 4, "submitted": 3, "decided": 3, "issued": 1}
    assert s["outcomes"]["APPROVED"] == 1 and s["outcomes"]["COUNTER_OFFER"] == 1 and s["outcomes"]["REJECTED"] == 1
    assert s["auto_decision_share"] == 67                       # 2 из 3 без специалиста
    assert s["fill_minutes_median"] == 4.0                      # медиана 2, 4, 6 минут
    assert s["decision_minutes_median"] == 1.0                  # медиана 1, 24, 1
    assert s["top_reasons"] == [{"text": "Налоговая задолженность", "count": 1}]
    assert s["refused"] == 1 and s["returned_after_refusal_share"] == 100
    assert s["precheck_match_share"] == 100 and s["precheck_compared"] == 1


def test_empty_database():
    s = compute([], [])
    assert s["funnel"]["drafts"] == 0 and s["auto_decision_share"] is None and s["fill_minutes_median"] is None
