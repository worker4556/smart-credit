"""ML-сервис Smart Credit. Stateless: вызывается только backend.

Эндпоинты: /health, /v1/score, /v1/score/batch, /v1/precheck, /v1/recommend, /v1/explain.
Контракт — docs/api-contract.md, раздел C.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .catalog import PRODUCTS, recommend
from .explain import llm_rephrase, llm_status, template_explanation
from .features import ScoringFeatures
from .scorecard import load_scorecard

logging.basicConfig(level=logging.INFO, format='{"level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}')

logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(title="Smart Credit ML", version="1.0.0",
              description="Скоринговая карта, предоценка, подбор продукта и объяснения решений.")

CHANCE_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}


# ---------- схемы ----------

class Factor(BaseModel):
    feature: str
    label: str
    value: float | int | bool | str
    bin: str
    points: int
    impact: Literal["POSITIVE", "NEGATIVE", "NEUTRAL"]


class ScoreResult(BaseModel):
    model_version: str
    score: int
    pd: float
    grade: Literal["A", "B", "C", "D", "E"]
    chance: Literal["HIGH", "MEDIUM", "LOW"]
    chance_percent: int = Field(description="Индекс шансов 0–100 для интерфейса, не вероятность")
    monthly_payment: int
    factors: list[Factor]


class ScoreRequest(BaseModel):
    application_id: str | None = None
    features: ScoringFeatures


class BatchRequest(BaseModel):
    items: list[ScoringFeatures] = Field(max_length=200)


class Variant(BaseModel):
    amount: int | None = None
    term_months: int | None = None
    revenue_confirmed: bool | None = None


class PrecheckRequest(BaseModel):
    features: ScoringFeatures
    variants: list[Variant] = []
    min_amount: int | None = None
    max_term_months: int | None = None


class Hint(BaseModel):
    change: Variant
    chance: str
    chance_percent: int
    grade: str
    text: str


class PrecheckResult(BaseModel):
    model_version: str
    chance: str
    chance_percent: int
    grade: str
    pd: float
    monthly_payment: int
    hints: list[Hint]


class RecommendRequest(BaseModel):
    purpose: Literal["EQUIPMENT", "WORKING_CAPITAL", "CASH_GAP", "CONTRACT", "EXPANSION", "OTHER"]
    amount: int = Field(gt=0)
    term_months: int = Field(gt=0)


class ExplainRequest(BaseModel):
    outcome: Literal["APPROVED", "COUNTER_OFFER", "REJECTED", "INFO_REQUESTED", "MANUAL_REVIEW"]
    requested_amount: int
    offer: dict | None = None
    reasons: list[str] = []
    factors: list[dict] = []
    use_llm: bool = True


# ---------- эндпоинты ----------

@app.get("/health")
def health():
    sc = load_scorecard()
    return {"status": "ok", "model_version": sc.version, "llm": llm_status()}


@app.post("/v1/score", response_model=ScoreResult)
def score(req: ScoreRequest):
    return load_scorecard().score(req.features)


@app.post("/v1/score/batch")
def score_batch(req: BatchRequest) -> dict:
    """Пакетный скоринг для симуляций «что если» (карта маршрута в backend)."""
    sc = load_scorecard()
    return {"items": [sc.score(f) for f in req.items]}


def _apply(f: ScoringFeatures, v: Variant) -> ScoringFeatures:
    upd = {}
    if v.amount is not None:
        upd["requested_amount"] = v.amount
    if v.term_months is not None:
        upd["term_months"] = v.term_months
    if v.revenue_confirmed is not None:
        upd["revenue_confirmed"] = v.revenue_confirmed
    return f.model_copy(update=upd)


def _auto_variants(f: ScoringFeatures, min_amount: int | None, max_term: int | None) -> list[Variant]:
    out: list[Variant] = []
    floor = min_amount or 100_000
    for k in (0.9, 0.8, 0.7, 0.6, 0.5, 0.4):
        amount = int(f.requested_amount * k // 50_000 * 50_000)
        if amount >= floor:
            out.append(Variant(amount=amount))
    for term in (12, 24, 36, 48, 60):
        if term > f.term_months and term <= (max_term or 60):
            out.append(Variant(term_months=term))
    if not f.revenue_confirmed:
        out.append(Variant(revenue_confirmed=True))
    return out


def _hint_text(v: Variant, chance: str) -> str:
    word = {"HIGH": "высокие", "MEDIUM": "средние", "LOW": "низкие"}[chance]
    if v.amount is not None:
        return f"При сумме до {v.amount:,} ₽ шансы {word}".replace(",", " ")
    if v.term_months is not None:
        return f"Увеличьте срок до {v.term_months} мес — платёж станет ниже, шансы {word}"
    return f"Подтвердите выручку выпиской — шансы {word}"


@app.post("/v1/precheck", response_model=PrecheckResult)
def precheck(req: PrecheckRequest):
    sc = load_scorecard()
    base = sc.score(req.features)
    variants = req.variants or _auto_variants(req.features, req.min_amount, req.max_term_months)

    best_by_kind: dict[str, Hint] = {}
    for v in variants:
        r = sc.score(_apply(req.features, v))
        better_class = CHANCE_RANK[r["chance"]] > CHANCE_RANK[base["chance"]]
        better_score = r["chance_percent"] - base["chance_percent"] >= 5
        if not (better_class or better_score):
            continue
        kind = "amount" if v.amount is not None else "term" if v.term_months is not None else "revenue"
        hint = Hint(change=v, chance=r["chance"], chance_percent=r["chance_percent"], grade=r["grade"], text=_hint_text(v, r["chance"]))
        cur = best_by_kind.get(kind)
        # для суммы — наибольшая сумма с лучшим классом, для срока — наименьший срок
        if cur is None or (CHANCE_RANK[hint.chance], -abs((v.amount or 0) - req.features.requested_amount), -(v.term_months or 0)) > \
                (CHANCE_RANK[cur.chance], -abs((cur.change.amount or 0) - req.features.requested_amount), -(cur.change.term_months or 0)):
            best_by_kind[kind] = hint

    hints = sorted(best_by_kind.values(), key=lambda h: (-CHANCE_RANK[h.chance], -h.chance_percent))
    return PrecheckResult(model_version=base["model_version"], chance=base["chance"], chance_percent=base["chance_percent"],
                          grade=base["grade"], pd=base["pd"], monthly_payment=base["monthly_payment"], hints=hints)


@app.post("/v1/recommend")
def recommend_products(req: RecommendRequest) -> dict:
    return {"items": recommend(req.purpose, req.amount, req.term_months)}


@app.post("/v1/explain")
def explain(req: ExplainRequest) -> dict:
    text, recs = template_explanation(req.outcome, req.requested_amount, req.offer, req.reasons, req.factors)
    llm_text = llm_rephrase(text, req.outcome) if req.use_llm else None
    return {"text": llm_text or text, "template_text": text, "recommendations": recs, "source": "LLM" if llm_text else "TEMPLATE"}


@app.get("/v1/products")
def products() -> dict:
    return {"items": [{"code": c, **p} for c, p in PRODUCTS.items()]}
