"""Add seuil_alerte + prix_unitaire to pieces

Revision ID: 0018
Revises: 0017
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    for col, coltype in [("seuil_alerte", sa.Integer()), ("prix_unitaire", sa.Float())]:
        exists = conn.execute(sa.text(
            f"SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'pieces' AND column_name = '{col}')"
        )).scalar()
        if not exists:
            op.add_column("pieces", sa.Column(col, coltype, nullable=True))


def downgrade() -> None:
    op.drop_column("pieces", "prix_unitaire")
    op.drop_column("pieces", "seuil_alerte")
