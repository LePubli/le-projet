"""cause_medias and solution_medias JSON columns on bons_travail

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-26 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bons_travail",
        sa.Column("cause_medias", sa.JSON(), nullable=True, server_default=sa.text("'[]'::json")),
    )
    op.add_column(
        "bons_travail",
        sa.Column("solution_medias", sa.JSON(), nullable=True, server_default=sa.text("'[]'::json")),
    )


def downgrade() -> None:
    op.drop_column("bons_travail", "solution_medias")
    op.drop_column("bons_travail", "cause_medias")
