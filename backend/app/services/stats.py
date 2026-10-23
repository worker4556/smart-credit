"""Эффект продукта для банка (docs/route-pages.md, раздел 8): считается только по событиям заявок в базе,
одинаково для всех заявок — без выборочных «удобных» цифр."""
from __future__ import annotations

from collections import Counter
from datetime import datetime
from statistics import median
from typing import Any

from app.db.models import Application, ApplicationEvent

DECISIONS = ("APPROVED", "COUNTER_OFFER", "INFO_REQUESTED", "REJECTED", "SUSPENDED_115FZ")
ISSUED = {"DISBURSED"}
AFTER_REFUSAL = {"REJECTED", "DECLINED_BY_CLIENT"}
# Ожидаемый исход предоценки ↔ решение банка
PRECHECK_MATCH = {"APPROVED": "APPROVED", "COUNTER_OFFER": "COUNTER_OFFER", "REJECTED": "REJECTED"}


def _minutes(start: datetime, end: datetime) -> float:
    return max((end - start).total_seconds(), 0) / 60


def _median(values: list[float]) -> float | None:
    return round(median(values), 1) if values else None


def compute(applications: list[Application], events: list[ApplicationEvent]) -> dict[str, Any]:
    by_app: dict[Any, list[ApplicationEvent]] = {}
    for event in sorted(events, key=lambda e: e.at):
        by_app.setdefault(event.application_id, []).append(event)

    submitted, decided, issued = 0, 0, 0
    outcomes: Counter[str] = Counter()
    auto = 0
    fill, wait = [], []
    reasons: Counter[str] = Counter()
    refused, returned = 0, 0
    compared, matched = 0, 0
    apps_by_company: dict[Any, list[Application]] = {}
    for app in applications:
        apps_by_company.setdefault(app.company_id, []).append(app)

    for app in applications:
        history = by_app.get(app.id, [])
        sent = next((e for e in history if e.to_status == "SUBMITTED"), None)
        first = next((e for e in history if e.to_status in DECISIONS), None)
        if sent:
            submitted += 1
            fill.append(_minutes(app.created_at, sent.at))
        if first:
            decided += 1
            outcomes[first.to_status] += 1
            if (first.actor or "").lower() == "system":
                auto += 1
            if sent:
                wait.append(_minutes(sent.at, first.at))
            ml = (app.precheck or {}).get("ml") or {}
            expected = PRECHECK_MATCH.get(str(ml.get("expected_outcome")))
            if expected and first.to_status in PRECHECK_MATCH:
                compared += 1
                matched += int(expected == first.to_status)
        if app.status in ISSUED or any(e.to_status in ISSUED for e in history):
            issued += 1
        for reason in (app.decision or {}).get("reasons") or []:
            text = reason.get("text") if isinstance(reason, dict) else str(reason)
            if text:
                reasons[text] += 1
        if app.status in AFTER_REFUSAL:
            refused += 1
            ready = ((app.route or {}).get("status") == "READY")
            newer = any(other.created_at > app.created_at for other in apps_by_company.get(app.company_id, [])
                        if other.id != app.id)
            returned += int(ready or newer)

    share = lambda part, whole: round(100 * part / whole) if whole else None  # noqa: E731
    return {
        "funnel": {"drafts": len(applications), "submitted": submitted, "decided": decided, "issued": issued},
        "outcomes": {key: outcomes.get(key, 0) for key in DECISIONS},
        "auto_decision_share": share(auto, decided),
        "fill_minutes_median": _median(fill),
        "decision_minutes_median": _median(wait),
        "top_reasons": [{"text": text, "count": count} for text, count in reasons.most_common(5)],
        "refused": refused,
        "returned_after_refusal_share": share(returned, refused),
        "precheck_match_share": share(matched, compared),
        "precheck_compared": compared,
    }
