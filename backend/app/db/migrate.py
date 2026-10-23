"""Схема БД через миграции Alembic — применяются при старте backend.

Базы, созданные до появления миграций (через create_all), уже содержат таблицы: их помечаем текущей
ревизией (stamp), не пересоздавая. Дальше любые изменения схемы — только новой миграцией.
"""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


def alembic_config(connection) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS))
    cfg.attributes["connection"] = connection
    return cfg


def upgrade_db(engine: Engine) -> str:
    """Возвращает, что сделано: 'upgraded' или 'stamped'."""
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        cfg = alembic_config(connection)
        if "users" in tables and "alembic_version" not in tables:
            command.stamp(cfg, "head")
            return "stamped"
        command.upgrade(cfg, "head")
        return "upgraded"
