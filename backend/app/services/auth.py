"""Хеширование паролей и JWT."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str, login: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "login": login,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
