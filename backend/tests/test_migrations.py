"""Миграции на настоящем PostgreSQL: TEST_DATABASE_URL (в CI — сервис postgres). Без него тест пропускается."""
import os

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text
from sqlmodel import SQLModel

URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="нужен TEST_DATABASE_URL с пустой базой PostgreSQL")


def _reset(engine):
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))


def _diff(engine):
    """Разница между схемой в базе и моделями: должна быть пустой после миграций."""
    with engine.connect() as conn:
        context = MigrationContext.configure(conn, opts={"compare_type": True})
        return compare_metadata(context, SQLModel.metadata)


def test_upgrade_creates_schema_matching_models():
    from app.db import models  # noqa: F401
    from app.db.migrate import upgrade_db

    engine = create_engine(URL)
    _reset(engine)
    assert upgrade_db(engine) == "upgraded"
    tables = set(inspect(engine).get_table_names())
    assert set(SQLModel.metadata.tables) <= tables and "alembic_version" in tables
    assert _diff(engine) == []                    # схема совпадает с моделями
    assert upgrade_db(engine) == "upgraded"       # повторный запуск безопасен


def test_legacy_database_is_stamped_not_recreated():
    from app.db import models  # noqa: F401
    from app.db.migrate import upgrade_db

    engine = create_engine(URL)
    _reset(engine)
    SQLModel.metadata.create_all(engine)          # база «до миграций»
    with engine.begin() as conn:
        # Старая база содержала лишнее уникальное ограничение, которого нет в моделях
        conn.execute(text("ALTER TABLE companies ADD CONSTRAINT uq_company_user UNIQUE (user_id)"))
    assert upgrade_db(engine) == "stamped"
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM alembic_version")).scalar() == 1
    assert _diff(engine) == []                    # поздние миграции применились, ограничение убрано
