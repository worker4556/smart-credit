"""Моки из ml/fixtures/personas.json.

Два индекса:
  - по ключу персоны (P1, P2, …, ZSK) — для seed и расчёта ML
  - по ИНН — вспомогательный
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_CANDIDATES = [
    Path(__file__).resolve().parents[3] / "ml" / "fixtures" / "personas.json",
    Path("/app/ml/fixtures/personas.json"),
    Path("ml/fixtures/personas.json"),
]


@lru_cache
def _raw() -> dict[str, Any]:
    for path in _CANDIDATES:
        if path.is_file():
            data = json.loads(path.read_text(encoding="utf-8"))
            return {k: v for k, v in data.items() if isinstance(v, dict)}
    raise FileNotFoundError(
        "Не найден ml/fixtures/personas.json. "
        "Проверь, что папка ml лежит рядом с backend."
    )


@lru_cache
def load_personas_by_key() -> dict[str, Any]:
    """Ключ = P1 / P2 / P3 / P4 / P5 / ZSK."""
    return dict(_raw())


@lru_cache
def load_personas_by_inn() -> dict[str, Any]:
    by_inn: dict[str, Any] = {}
    for key, persona in _raw().items():
        inn = str(persona.get("inn") or key)
        by_inn[inn] = {**persona, "_key": key}
    return by_inn


def get_persona_by_key(key: str) -> dict[str, Any] | None:
    return load_personas_by_key().get(key)


def get_persona_by_inn(inn: str) -> dict[str, Any] | None:
    return load_personas_by_inn().get(str(inn))
