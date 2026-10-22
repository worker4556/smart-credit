from __future__ import annotations

import uuid

from fastapi import Request


def request_id(request: Request) -> str:
    return request.headers.get("X-Request-ID") or uuid.uuid4().hex
