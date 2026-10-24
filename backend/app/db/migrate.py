"""Схема БД через миграции Alembic — применяются при старте backend.

Базы, созданные до появления миграций (через create_all), уже содержат таблицы: их помечаем
базовой ревизией (stamp) и затем применяем все более поздние миграции, не пересоздавая таблицы.
Дальше любые изменения схемы — только новой миграцией.
"""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
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
            # Legacy-база уже совпадает с первой ревизией: ставим её базой, а не head,
            # чтобы не пропустить миграции, добавленные после неё (например, чистку схемы).
            script = ScriptDirectory.from_config(cfg)
            bases = script.get_bases()
            command.stamp(cfg, bases[0] if bases else "head")
            command.upgrade(cfg, "head")
            return "stamped"
        command.upgrade(cfg, "head")
        return "upgraded"
