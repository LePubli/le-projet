"""Add rotation column to machines

Colonne historiquement ajoutée à la main en prod (jamais via Alembic — voir
le bloc supprimé de backend/entrypoint.sh) pour stocker l'orientation de
l'étiquette d'une machine dans SchemaInteractif.tsx. Sur les bases où elle
existe déjà, upgrade() est un no-op idempotent ; sur une base vierge, elle
crée la colonne.

Revision ID: 0021
Revises: 0020
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_name = 'machines' AND column_name = 'rotation')"
        )
    ).scalar()
    if not exists:
        op.add_column("machines", sa.Column("rotation", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("machines", "rotation")
