"""ML-сервис Smart Credit: движок одобрения «Маршрут к одобрению». Stateless, вызывается только backend.

Одна модель правил (config/policy.yaml + config/reasons.yaml) считает предоценку, решение, причины и маршрут.
Контракт — docs/api-contract.md, раздел C.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import llm
from .config import get_policy
from .decision import RequestError, decide, limit, offers, precheck, validate_request
from .glossary import lookup
from .explain import Explanation, explain_decision, explain_precheck, explain_route
from .intent import Intent, parse
from .route import Route, SpecialistDecision, build_route
from .finance import quote, weather
from .schemas import (Applicant, Decision, LimitResult, LoanRequest, Offer, Precheck, ProductCode, Quote, ScoreResult,
                      Weather)
from .scoring import score

logging.basicConfig(level=logging.INFO, format='{"level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}')
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(title="Smart Credit ML — движок одобрения", version="2.0.0",
              description="Скоринг (Б3), решение по правилам (Б4), предоценка, маршрут к одобрению, "
                          "разбор задачи клиента и пересказ причин локальной LLM.")


class IntentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500, examples=["нужно 800 тыс. на закупку к сезону"])
    use_llm: bool = True


class RouteRequest(BaseModel):
    applicant: Applicant
    assume_done: list[str] = Field(default=[], description="Коды шагов, которые клиент отметил выполненными (прогноз)")
    specialist_decision: SpecialistDecision | None = Field(default=None, description="Путь G: маршрут от решения специалиста")


class QuoteRequest(BaseModel):
    product: ProductCode
    amount: int = Field(gt=0)
    term_months: int | None = Field(default=None, ge=1, le=60)


class WeatherRequest(QuoteRequest):
    rate: float | None = Field(default=None, gt=0, le=100, description="Ставка решения; по умолчанию — ставка продукта")


class DecisionWithOffers(Decision):
    offers: list[Offer]


class ExplainRequest(BaseModel):
    decision: Decision | None = None
    precheck: Precheck | None = None
    route: Route | None = None
    use_llm: bool = True


def _validated(a: Applicant, *loc: str) -> Applicant:
    """Параметры запроса в пределах продукта, иначе 422 в формате ошибок валидации FastAPI."""
    try:
        validate_request(get_policy(), a.request)
    except RequestError as exc:
        raise HTTPException(422, [{"loc": ["body", *loc, "request", exc.field], "msg": exc.message,
                                   "type": "value_error.product_range"}])
    return a


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "policy_version": get_policy().version, "llm": llm.status()}


@app.post("/v1/intent", response_model=Intent, summary="Шаг 1: фраза клиента → цель, сумма, срок, продукт")
def intent(req: IntentRequest) -> Intent:
    return parse(req.text, use_llm=req.use_llm)


@app.post("/v1/precheck", response_model=Precheck, summary="Шаг 3: предоценка без заявки и без БКИ")
def precheck_endpoint(a: Applicant) -> Precheck:
    return precheck(get_policy(), _validated(a))


@app.post("/v1/score", response_model=ScoreResult, summary="Б3: баллы по 9 факторам и стоп-факторы")
def score_endpoint(a: Applicant) -> ScoreResult:
    return score(get_policy(), _validated(a))


@app.post("/v1/limit", response_model=LimitResult, summary="Доступная сумма по формуле продукта")
def limit_endpoint(a: Applicant) -> LimitResult:
    return limit(get_policy(), _validated(a))


@app.post("/v1/decision", response_model=DecisionWithOffers, summary="Б3 + Б4: исход, сумма, стоимость, причины, триггеры специалиста")
def decision_endpoint(a: Applicant) -> DecisionWithOffers:
    policy = get_policy()
    d = decide(policy, _validated(a))
    return DecisionWithOffers(**d.model_dump(), offers=offers(policy, a, d))


@app.post("/v1/route", response_model=Route, summary="Маршрут к одобрению и «Пересчитать»")
def route_endpoint(req: RouteRequest) -> Route:
    try:
        return build_route(get_policy(), _validated(req.applicant, "applicant"), req.assume_done, req.specialist_decision)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@app.post("/v1/quote", response_model=Quote, summary="Калькулятор для ползунков: платёж, переплата, график — без скоринга")
def quote_endpoint(req: QuoteRequest) -> Quote:
    _check_product_range(req.product, req.amount, req.term_months)
    return quote(get_policy(), req.product, req.amount, req.term_months)


def _check_product_range(product: str, amount: int, term_months: int | None) -> None:
    try:
        validate_request(get_policy(), LoanRequest(product=product, amount=amount, term_months=term_months))
    except RequestError as exc:
        raise HTTPException(422, [{"loc": ["body", exc.field], "msg": exc.message, "type": "value_error.product_range"}])


@app.post("/v1/weather", response_model=Weather, summary="«Погода»: стоимость при росте ставки и при просрочке")
def weather_endpoint(req: WeatherRequest) -> Weather:
    _check_product_range(req.product, req.amount, req.term_months)
    return weather(get_policy(), req.product, req.amount, req.term_months, req.rate)


@app.post("/v1/explain", response_model=Explanation, summary="Текст для клиента: шаблон или пересказ LLM с проверкой")
def explain_endpoint(req: ExplainRequest) -> Explanation:
    policy = get_policy()
    if req.decision:
        return explain_decision(policy, req.decision, req.use_llm)
    if req.precheck:
        return explain_precheck(policy, req.precheck, req.use_llm)
    if req.route:
        return explain_route(policy, req.route, req.use_llm)
    raise HTTPException(422, "Нужно одно из полей: decision, precheck, route")


@app.get("/v1/reasons", summary="Справочник причин — для специалиста и фронта")
def reasons() -> dict:
    return {"items": [{"code": c, **r} for c, r in get_policy().reasons.items()]}


@app.get("/v1/glossary", summary="Словарь простых слов")
def glossary_endpoint() -> dict:
    return {"items": get_policy().glossary}


@app.get("/v1/glossary/{term}", summary="Один термин по названию или форме слова")
def glossary_term(term: str) -> dict:
    found = lookup(get_policy(), term)
    if not found:
        raise HTTPException(404, "Термин не найден в словаре")
    return found


@app.get("/v1/policy", summary="Действующие веса, пороги и продукты")
def policy_endpoint() -> dict:
    return get_policy().raw
