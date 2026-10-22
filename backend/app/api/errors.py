from __future__ import annotations

from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from starlette.requests import Request

from app.errors import FieldError
from app.services.ml import MLError

__all__ = ["FIELD_ALIASES", "FieldError", "field_error_handler", "ml_error"]

FIELD_ALIASES = {
    "term_months": "term",
    "monthly_revenue": "monthlyRevenue",
    "loan_payment": "loanPayment",
    "had_overdue_2y": "hadOverdue2y",
}


def ml_error(exc: MLError) -> HTTPException:
    if exc.status_code in {400, 422}:
        if exc.field:
            field = FIELD_ALIASES.get(exc.field, exc.field)
            return FieldError(exc.message, field)
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Сервис оценки временно недоступен",
    )


async def field_error_handler(request: Request, exc: FieldError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "field": exc.field},
    )
