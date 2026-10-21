"""Зависимости FastAPI: сессия БД и текущий пользователь из JWT."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.db.base import get_session
from app.db.models import Company, User
from app.services.auth import decode_token

security = HTTPBearer(auto_error=False)

SessionDep = Annotated[Session, Depends(get_session)]


def get_current_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> User:
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
        )
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или просроченный токен",
        )
    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или просроченный токен",
        )
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: str):
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )
        return user

    return checker


def get_user_company(session: Session, user: User) -> Company | None:
    return session.exec(select(Company).where(Company.user_id == user.id)).first()
