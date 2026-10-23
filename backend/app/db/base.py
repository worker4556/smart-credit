from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)


def init_db() -> None:
    """Схема — миграциями Alembic (app/migrations), а не create_all: изменения версионируются и воспроизводимы."""
    from app.db import models  # noqa: F401
    from app.db.migrate import upgrade_db

    upgrade_db(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
