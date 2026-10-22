from __future__ import annotations

import logging
import time
import uuid
from typing import Any
from urllib.parse import quote as url_quote

import httpx

from app.config import settings

log = logging.getLogger(__name__)


class MLError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 502,
        field: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.field = field


class MLUnavailable(MLError):
    def __init__(self, message: str = "Сервис оценки временно недоступен") -> None:
        super().__init__(message)


class MLValidationError(MLError):
    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message, status_code=400, field=field)


class MLResponseError(MLError):
    pass


def new_request_id(value: str | None = None) -> str:
    return value or uuid.uuid4().hex


def _extract_error(response: httpx.Response) -> tuple[str | None, str]:
    message = f"ML вернул HTTP {response.status_code}"
    field: str | None = None
    try:
        payload = response.json()
    except ValueError:
        text = response.text.strip()
        if text:
            message = text[:500]
        return field, message

    detail = payload.get("detail") if isinstance(payload, dict) else payload
    if isinstance(detail, list) and detail:
        item = detail[0]
        if isinstance(item, dict):
            loc = item.get("loc")
            if isinstance(loc, list) and loc:
                field = str(loc[-1])
            message = str(item.get("msg") or message)
        else:
            message = str(item)
    elif isinstance(detail, dict):
        field = detail.get("field")
        message = str(
            detail.get("message")
            or detail.get("msg")
            or detail.get("detail")
            or message
        )
    elif detail:
        message = str(detail)
    return field, message


def _client(timeout: float, headers: dict[str, str]) -> httpx.Client:
    return httpx.Client(
        base_url=settings.ML_URL.rstrip("/"),
        timeout=timeout,
        headers=headers,
        trust_env=False,
    )


def _request(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout: float = 5.0,
    attempts: int = 3,
    request_id: str | None = None,
) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "X-Request-ID": new_request_id(request_id),
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if settings.ML_SERVICE_TOKEN:
        headers["X-Service-Token"] = settings.ML_SERVICE_TOKEN

    for attempt in range(1, max(1, attempts) + 1):
        try:
            with _client(timeout, headers) as client:
                response = client.request(method, path, json=payload)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            log.warning("ML request %s failed (attempt %s): %s", path, attempt, exc)
            if attempt < attempts:
                time.sleep(0.15 * attempt)
                continue
            raise MLUnavailable() from exc

        if response.status_code == 422:
            field, message = _extract_error(response)
            raise MLValidationError(message, field)

        if response.status_code >= 500:
            log.warning(
                "ML request %s returned %s (attempt %s)",
                path,
                response.status_code,
                attempt,
            )
            if attempt < attempts:
                time.sleep(0.15 * attempt)
                continue
            raise MLUnavailable()

        if response.status_code >= 400:
            field, message = _extract_error(response)
            raise MLResponseError(
                message,
                status_code=response.status_code,
                field=field,
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise MLUnavailable("Сервис оценки вернул некорректный ответ") from exc
        if not isinstance(data, dict):
            raise MLUnavailable("Сервис оценки вернул некорректный ответ")
        return data

    raise MLUnavailable()


def _post(
    path: str,
    payload: dict[str, Any],
    *,
    timeout: float = 5.0,
    attempts: int = 3,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _request(
        "POST",
        path,
        payload,
        timeout=timeout,
        attempts=attempts,
        request_id=request_id,
    )


def _get(
    path: str,
    *,
    timeout: float = 5.0,
    attempts: int = 3,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _request(
        "GET",
        path,
        None,
        timeout=timeout,
        attempts=attempts,
        request_id=request_id,
    )


def intent(
    text: str,
    *,
    use_llm: bool = True,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/intent",
        {"text": text, "use_llm": use_llm},
        timeout=20.0,
        attempts=1,
        request_id=request_id,
    )


def quote(
    product: str,
    amount: int,
    term_months: int | None,
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/quote",
        {"product": product, "amount": amount, "term_months": term_months},
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def precheck(
    applicant: dict[str, Any],
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/precheck",
        applicant,
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def decision(
    applicant: dict[str, Any],
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/decision",
        applicant,
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def explain(
    payload: dict[str, Any],
    *,
    use_llm: bool = True,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/explain",
        {**payload, "use_llm": use_llm},
        timeout=40.0,
        attempts=1,
        request_id=request_id,
    )


def route(
    payload: dict[str, Any],
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/route",
        payload,
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def assistant(
    payload: dict[str, Any],
    *,
    use_llm: bool = True,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/assistant",
        {**payload, "use_llm": use_llm},
        timeout=40.0 if use_llm else 5.0,
        attempts=1 if use_llm else 3,
        request_id=request_id,
    )


def glossary(*, request_id: str | None = None) -> dict[str, Any]:
    return _get(
        "/v1/glossary",
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def glossary_term(term: str, *, request_id: str | None = None) -> dict[str, Any]:
    return _get(
        f"/v1/glossary/{url_quote(term, safe='')}",
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def limit(
    payload: dict[str, Any],
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    return _post(
        "/v1/limit",
        payload,
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def reasons(*, request_id: str | None = None) -> dict[str, Any]:
    return _get(
        "/v1/reasons",
        timeout=5.0,
        attempts=3,
        request_id=request_id,
    )


def health(*, request_id: str | None = None) -> dict[str, Any]:
    return _get(
        "/health",
        timeout=5.0,
        attempts=1,
        request_id=request_id,
    )
