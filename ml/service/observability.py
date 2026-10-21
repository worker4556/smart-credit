"""Эксплуатация ML-сервиса: аудит решений, метрики в формате Prometheus, сквозной request_id.

Без внешних зависимостей: счётчики в памяти процесса (один процесс uvicorn), формат — Prometheus text 0.0.4.
"""
from __future__ import annotations

import hashlib
import json
import threading
from collections import defaultdict
from datetime import datetime, timezone

from pydantic import BaseModel

from .config import Policy

ENGINE_VERSION = "2.1.0"


class Audit(BaseModel):
    """Чем и на каких данных посчитан результат: решение можно воспроизвести и объяснить."""
    policy_version: str
    engine_version: str
    input_hash: str
    decided_at: str


def audit_of(policy: Policy, payload: BaseModel | dict) -> Audit:
    data = payload.model_dump(mode="json") if isinstance(payload, BaseModel) else payload
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return Audit(policy_version=policy.version, engine_version=ENGINE_VERSION, input_hash=digest, decided_at=now)


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[tuple[str, tuple], float] = defaultdict(float)

    def inc(self, name: str, value: float = 1.0, **labels: str) -> None:
        with self._lock:
            self._counters[(name, tuple(sorted(labels.items())))] += value

    def render(self) -> str:
        with self._lock:
            items = sorted(self._counters.items())
        lines, typed = [], set()
        for (name, labels), value in items:
            base = name.removesuffix("_sum").removesuffix("_count")
            if base not in typed:
                kind = "summary" if base != name else "counter"
                lines.append(f"# TYPE {base} {kind}")
                typed.add(base)
            label_text = ",".join(f'{k}="{v}"' for k, v in labels)
            lines.append(f"{name}{{{label_text}}} {value:g}" if label_text else f"{name} {value:g}")
        return "\n".join(lines) + "\n"


METRICS = Metrics()
