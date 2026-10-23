from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.deps import require_roles
from app.api.errors import ml_error
from app.db.models import User
from app.schemas.applications import IntentRequest, IntentResponse, Quote, QuoteRequest
from app.services import ml
from app.services.credit import intent_from_ml, product_for, quote_from_ml
from app.services.request_id import request_id

router = APIRouter(tags=["credit"])

ClientUser = Annotated[User, Depends(require_roles("CLIENT"))]


@router.post("/quote", response_model=Quote)
def calculate_quote(
    body: QuoteRequest,
    request: Request,
    user: ClientUser,
) -> Quote:
    product = product_for(body.goal)
    term = None if product == "OVERDRAFT" else body.term
    try:
        payload = ml.quote(
            product,
            body.amount,
            term,
            request_id=request_id(request),
        )
    except ml.MLError as exc:
        raise ml_error(exc) from exc

    try:
        return quote_from_ml(payload)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Сервис оценки вернул некорректный расчёт",
        ) from exc


@router.post("/intent", response_model=IntentResponse)
def parse_intent(
    body: IntentRequest,
    request: Request,
    user: ClientUser,
) -> IntentResponse:
    try:
        payload = ml.intent(
            body.text,
            use_llm=body.use_llm,
            request_id=request_id(request),
        )
    except ml.MLError as exc:
        raise ml_error(exc) from exc

    return intent_from_ml(payload)
