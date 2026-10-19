"""Применение скоринговой карты из artifacts/scorecard.json."""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from .features import FEATURES, ScoringFeatures, bin_label_text, derive

ARTIFACT = Path(__file__).resolve().parents[1] / "artifacts" / "scorecard.json"

# Грейд по PD: верхние границы
GRADE_THRESHOLDS = {"A": 0.02, "B": 0.05, "C": 0.10, "D": 0.20}
CHANCE_BY_GRADE = {"A": "HIGH", "B": "HIGH", "C": "MEDIUM", "D": "LOW", "E": "LOW"}


class Scorecard:
    def __init__(self, spec: dict):
        self.version: str = spec["model_version"]
        self.base_points: int = spec["base_points"]
        self.factor: float = spec["scaling"]["factor"]
        self.offset: float = spec["scaling"]["offset"]
        self.points = {f["name"]: f["points"] for f in spec["features"]}

    def pd_from_score(self, score: float) -> float:
        return 1 / (1 + math.exp((score - self.offset) / self.factor))

    def score(self, features: ScoringFeatures) -> dict:
        derived = derive(features)
        factors, total = [], self.base_points
        for f in FEATURES:
            value = derived[f.name]
            bin_key = f.bin_of(value)
            pts = self.points[f.name][bin_key]
            total += pts
            factors.append({
                "feature": f.name,
                "label": f.label,
                "value": value,
                "bin": bin_label_text(f, bin_key),
                "points": pts,
                "impact": "POSITIVE" if pts > 0 else "NEGATIVE" if pts < 0 else "NEUTRAL",
            })
        factors.sort(key=lambda x: -abs(x["points"]))
        pd = self.pd_from_score(total)
        grade = grade_of(pd)
        return {
            "model_version": self.version,
            "score": total,
            "pd": round(pd, 4),
            "grade": grade,
            "chance": CHANCE_BY_GRADE[grade],
            "chance_percent": chance_percent(total),
            "monthly_payment": derived["_monthly_payment"],
            "factors": factors,
        }


def grade_of(pd: float) -> str:
    for grade, upper in GRADE_THRESHOLDS.items():
        if pd < upper:
            return grade
    return "E"


def chance_percent(score: float) -> int:
    """Индекс шансов для интерфейса (0–100), монотонен по баллу. Не вероятность одобрения."""
    return int(max(3, min(97, round((score - 480) / 2.6))))


@lru_cache
def load_scorecard() -> Scorecard:
    return Scorecard(json.loads(ARTIFACT.read_text()))
