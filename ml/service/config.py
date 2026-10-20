"""Загрузка кредитной политики и справочника причин из config/*.yaml."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

CONFIG_DIR = Path(os.getenv("POLICY_DIR", Path(__file__).resolve().parent.parent / "config"))


class Policy:
    def __init__(self, policy: dict[str, Any], reasons: dict[str, Any], glossary: dict[str, Any] | None = None):
        self.raw = policy
        self.version: str = policy["version"]
        self.factors: dict[str, dict] = policy["factors"]
        self.industries: dict = policy["industries"]
        self.stops: dict = policy["stops"]
        self.decision: dict = policy["decision"]
        self.products: dict[str, dict] = policy["products"]
        self.precheck: dict = policy["precheck"]
        self.route: dict = policy["route"]
        self.reasons: dict[str, dict] = reasons["reasons"]
        self.glossary: list[dict] = (glossary or {}).get("terms", [])
        self._validate()

    def _validate(self) -> None:
        total = sum(f["max_points"] for f in self.factors.values())
        if total != 100:
            raise ValueError(f"Сумма max_points факторов должна быть 100, сейчас {total}")
        for name, f in self.factors.items():
            if f["reason"] not in self.reasons:
                raise ValueError(f"Фактор {name}: нет причины {f['reason']} в справочнике")

    def reason(self, code: str) -> dict:
        return self.reasons[code]

    def step_months(self, code: str) -> float | None:
        """Срок шага маршрута в месяцах; «недели» → route.weeks_as_months."""
        months = self.reasons[code].get("step", {}).get("months")
        if months == "weeks":
            return float(self.route["weeks_as_months"])
        return None if months is None else float(months)


@lru_cache
def get_policy() -> Policy:
    with open(CONFIG_DIR / "policy.yaml", encoding="utf-8") as f:
        policy = yaml.safe_load(f)
    with open(CONFIG_DIR / "reasons.yaml", encoding="utf-8") as f:
        reasons = yaml.safe_load(f)
    with open(CONFIG_DIR / "glossary.yaml", encoding="utf-8") as f:
        glossary = yaml.safe_load(f)
    return Policy(policy, reasons, glossary)
