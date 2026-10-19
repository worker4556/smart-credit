"""Обучение скоринговой карты: биннинг → one-hot → логистическая регрессия → баллы.

Результат — читаемый JSON (artifacts/scorecard.json), а не pickle:
сервису для скоринга не нужен scikit-learn, а карту можно показать жюри.

Запуск: uv run python -m training.train_scorecard
"""
from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from service.features import FEATURES, ScoringFeatures, derive
from service.scorecard import GRADE_THRESHOLDS

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "synthetic_sme.csv"
ARTIFACTS = ROOT / "artifacts"

MODEL_VERSION = "scorecard-1.0"
# Масштабирование баллов: 600 баллов при шансах good:bad = 20:1, +40 баллов удваивают шансы
BASE_SCORE, BASE_ODDS, PDO = 600, 20, 40


def binned_frame(df: pd.DataFrame) -> pd.DataFrame:
    raw_cols = list(ScoringFeatures.model_fields)
    rows = []
    for rec in df[raw_cols].to_dict("records"):
        d = derive(ScoringFeatures.model_construct(**rec))
        rows.append({f.name: f.bin_of(d[f.name]) for f in FEATURES})
    return pd.DataFrame(rows)


def design_matrix(binned: pd.DataFrame) -> tuple[np.ndarray, list[tuple[str, str]]]:
    columns, data = [], []
    for f in FEATURES:
        for b in f.bins:
            if b == f.reference:
                continue
            columns.append((f.name, b))
            data.append((binned[f.name] == b).to_numpy(dtype=float))
    return np.column_stack(data), columns


def ks_stat(y: np.ndarray, p: np.ndarray) -> float:
    order = np.argsort(p)
    y = y[order]
    cum_bad = np.cumsum(y) / y.sum()
    cum_good = np.cumsum(1 - y) / (1 - y).sum()
    return float(np.max(np.abs(cum_bad - cum_good)))


def information_value(binned: pd.DataFrame, y: pd.Series) -> dict[str, float]:
    iv = {}
    bad_total, good_total = y.sum(), (1 - y).sum()
    for f in FEATURES:
        total = 0.0
        for b in f.bins:
            mask = binned[f.name] == b
            bad = (y[mask].sum() + 0.5) / bad_total
            good = ((1 - y[mask]).sum() + 0.5) / good_total
            total += (good - bad) * math.log(good / bad)
        iv[f.name] = round(total, 4)
    return iv


def main() -> None:
    df = pd.read_csv(DATA, dtype={"okved": str})
    y = df["default_12m"]
    binned = binned_frame(df)
    X, columns = design_matrix(binned)

    X_tr, X_te, y_tr, y_te = train_test_split(X, y.to_numpy(), test_size=0.3, stratify=y, random_state=42)
    model = LogisticRegression(C=1.0, max_iter=2000)
    model.fit(X_tr, y_tr)

    p_tr, p_te = model.predict_proba(X_tr)[:, 1], model.predict_proba(X_te)[:, 1]
    auc_tr, auc_te = roc_auc_score(y_tr, p_tr), roc_auc_score(y_te, p_te)

    factor = PDO / math.log(2)
    offset = BASE_SCORE - factor * math.log(BASE_ODDS)
    intercept = float(model.intercept_[0])
    coefs = dict(zip(columns, model.coef_[0]))

    features_json = []
    for f in FEATURES:
        points = {b: (0 if b == f.reference else round(-factor * coefs[(f.name, b)])) for b in f.bins}
        features_json.append({"name": f.name, "label": f.label, "reference": f.reference, "points": points})

    base_points = round(offset - factor * intercept)

    # Распределение грейдов на тесте — по округлённым баллам, как в сервисе
    pd_te = 1 / (1 + np.exp(-(intercept + X_te @ model.coef_[0])))
    grades = pd.cut(pd_te, [0, *GRADE_THRESHOLDS.values(), 1], labels=[*GRADE_THRESHOLDS, "E"])
    grade_stats = (
        pd.DataFrame({"grade": grades, "y": y_te})
        .groupby("grade", observed=False)["y"].agg(["count", "mean"])
        .rename(columns={"count": "share", "mean": "default_rate"})
    )
    grade_stats["share"] = grade_stats["share"] / len(y_te)

    scorecard = {
        "model_version": MODEL_VERSION,
        "trained_at": date.today().isoformat(),
        "scaling": {"base_score": BASE_SCORE, "base_odds": BASE_ODDS, "pdo": PDO,
                    "factor": round(factor, 6), "offset": round(offset, 6)},
        "base_points": base_points,
        "features": features_json,
    }
    report = {
        "model_version": MODEL_VERSION,
        "dataset": {"rows": len(df), "default_rate": round(float(y.mean()), 4), "source": "synthetic, training/generate_data.py"},
        "metrics": {
            "auc_train": round(auc_tr, 4), "auc_test": round(auc_te, 4),
            "gini_train": round(2 * auc_tr - 1, 4), "gini_test": round(2 * auc_te - 1, 4),
            "ks_test": round(ks_stat(y_te, p_te), 4),
        },
        "information_value": information_value(binned, y),
        "grades_test": {g: {"share": round(r.share, 4), "default_rate": round(r.default_rate, 4)}
                        for g, r in grade_stats.iterrows()},
    }

    ARTIFACTS.mkdir(exist_ok=True)
    (ARTIFACTS / "scorecard.json").write_text(json.dumps(scorecard, ensure_ascii=False, indent=2))
    (ARTIFACTS / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report["metrics"], indent=2))
    print(json.dumps(report["grades_test"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
