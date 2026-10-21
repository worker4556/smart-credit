"""ML-сервис Smart Credit: движок одобрения «Маршрут к одобрению». Stateless, вызывается только backend.

Одна модель правил (config/policy.yaml + config/reasons.yaml) считает предоценку, решение, причины и маршрут.
Контракт — docs/api-contract.md, раздел C.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field

from . import llm
from .config import get_policy
from .decision import RequestError, decide, limit, offers, precheck, validate_request
from .assistant import AssistantAnswer, answer
from .glossary import lookup
from .explain import Explanation, explain_decision, explain_precheck, explain_route
from .intent import Intent, parse
from .route import Route, SpecialistDecision, build_route
from .finance import quote, weather
from .schemas import (Applicant, Decision, LimitResult, LoanRequest, Offer, Precheck, ProductCode, Quote, ScoreResult,
                      Weather)
from .observability import ENGINE_VERSION, METRICS, audit_of
from .scoring import score

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("ml")
logging.getLogger("httpx").setLevel(logging.WARNING)

SERVICE_TOKEN = os.getenv("ML_SERVICE_TOKEN", "")   # пусто — без проверки (внутренняя сеть compose)
OPEN_PATHS = ("/health", "/metrics", "/docs", "/openapi.json", "/redoc")

app = FastAPI(title="Smart Credit ML — движок одобрения", version=ENGINE_VERSION,
              description="Скоринг (Б3), решение по правилам (Б4), предоценка, маршрут к одобрению, "
                          "разбор задачи клиента и пересказ причин локальной LLM.")


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Сквозной request_id, служебный токен, журнал запроса в JSON, метрики."""
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    started = time.perf_counter()
    path = request.url.path
    if SERVICE_TOKEN and not path.startswith(OPEN_PATHS) and request.headers.get("X-Service-Token") != SERVICE_TOKEN:
        response = JSONResponse({"detail": "Нужен служебный токен X-Service-Token"}, status_code=401)
    else:
        response = await call_next(request)
    elapsed = time.perf_counter() - started
    response.headers["X-Request-ID"] = request_id
    route = request.scope.get("route")
    template = getattr(route, "path", path)
    METRICS.inc("ml_http_requests_total", path=template, status=str(response.status_code))
    METRICS.inc("ml_http_request_duration_seconds_sum", elapsed, path=template)
    METRICS.inc("ml_http_request_duration_seconds_count", path=template)
    log.info(json.dumps({"request_id": request_id, "method": request.method, "path": path,
                         "status": response.status_code, "duration_ms": round(elapsed * 1000, 1)}, ensure_ascii=False))
    return response


@app.get("/metrics", response_class=PlainTextResponse, summary="Метрики Prometheus")
def metrics() -> str:
    return METRICS.render()


class IntentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
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


class AssistantContext(BaseModel):
    decision: Decision | None = None
    route: Route | None = None


class AssistantRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    question: str = Field(min_length=1, max_length=500, examples=["почему мне отказали?"])
    context: AssistantContext
    use_llm: bool = True


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
    policy = get_policy()
    return precheck(policy, _validated(a)).model_copy(update={"audit": audit_of(policy, a)})


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
    METRICS.inc("ml_decisions_total", outcome=d.outcome)
    if d.specialist.required:
        METRICS.inc("ml_specialist_total")
    return DecisionWithOffers(**{**d.model_dump(), "audit": audit_of(policy, a)}, offers=offers(policy, a, d))


@app.post("/v1/route", response_model=Route, summary="Маршрут к одобрению и «Пересчитать»")
def route_endpoint(req: RouteRequest) -> Route:
    policy = get_policy()
    try:
        r = build_route(policy, _validated(req.applicant, "applicant"), req.assume_done, req.specialist_decision)
        return r.model_copy(update={"audit": audit_of(policy, req)})
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
        e = explain_decision(policy, req.decision, req.use_llm)
    elif req.precheck:
        e = explain_precheck(policy, req.precheck, req.use_llm)
    elif req.route:
        e = explain_route(policy, req.route, req.use_llm)
    else:
        raise HTTPException(422, "Нужно одно из полей: decision, precheck, route")
    METRICS.inc("ml_texts_total", source=e.source)
    if e.fallback_reason and req.use_llm:
        METRICS.inc("ml_llm_rejected_total")
    return e


@app.get("/v1/reasons", summary="Справочник причин — для специалиста и фронта")
def reasons() -> dict:
    return {"items": [{"code": c, **r} for c, r in get_policy().reasons.items()]}


@app.post("/v1/assistant", response_model=AssistantAnswer,
          summary="Помощник при отказе и нехватке: ответ только по фактам решения и маршрута")
def assistant_endpoint(req: AssistantRequest) -> AssistantAnswer:
    if not req.context.decision and not req.context.route:
        raise HTTPException(422, "Нужно решение или маршрут в context")
    a = answer(get_policy(), req.question, req.context.decision, req.context.route, req.use_llm)
    METRICS.inc("ml_texts_total", source=a.source)
    if a.fallback_reason and req.use_llm:
        METRICS.inc("ml_llm_rejected_total")
    return a


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
