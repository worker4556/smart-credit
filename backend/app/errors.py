from __future__ import annotations

from fastapi import HTTPException, status


class FieldError(HTTPException):
    def __init__(self, message: str, field: str) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )
        self.field = field
