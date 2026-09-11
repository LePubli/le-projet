"""machine position sur schema de ligne

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-08 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("machines", sa.Column("pos_x", sa.Float(), nullable=True))
    op.add_column("machines", sa.Column("pos_y", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("machines", "pos_y")
    op.drop_column("machines", "pos_x")
