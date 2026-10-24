"""drop legacy company user constraint

Revision ID: db022659fc14
Revises: 38f8803dc7ea
Create Date: 2026-10-24 13:54:46.676472
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'db022659fc14'
down_revision: Union[str, None] = '38f8803dc7ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Убираем legacy-ограничение: в моделях unique на companies.user_id уже задан
    уникальным индексом ix_companies_user_id. IF EXISTS нужен для баз, созданных
    сразу миграциями: там этого ограничения никогда не было."""
    op.execute("ALTER TABLE companies DROP CONSTRAINT IF EXISTS uq_company_user")


def downgrade() -> None:
    # Не восстанавливаем: ограничение было только в legacy-базе и дублировало уникальный индекс.
    pass
