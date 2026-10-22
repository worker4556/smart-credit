from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from app.api.errors import ml_error
from app.services import ml
from app.services.request_id import request_id

router = APIRouter(prefix="/glossary", tags=["glossary"])


@router.get("")
def glossary(request: Request) -> dict[str, Any]:
    try:
        return ml.glossary(request_id=request_id(request))
    except ml.MLError as exc:
        raise ml_error(exc) from exc


@router.get("/{term}")
def glossary_term(term: str, request: Request) -> dict[str, Any]:
    try:
        return ml.glossary_term(term, request_id=request_id(request))
    except ml.MLError as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Термин не найден",
            ) from exc
        raise ml_error(exc) from exc
