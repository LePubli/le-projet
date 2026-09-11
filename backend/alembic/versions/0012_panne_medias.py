"""cause_medias and solution_medias JSON columns on pannes

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # JSON columns — default [] so the frontend always receives an array.
    op.add_column(
        "pannes",
        sa.Column("cause_medias", sa.JSON(), nullable=True, server_default=sa.text("'[]'::json")),
    )
    op.add_column(
        "pannes",
        sa.Column("solution_medias", sa.JSON(), nullable=True, server_default=sa.text("'[]'::json")),
    )


def downgrade() -> None:
    op.drop_column("pannes", "solution_medias")
    op.drop_column("pannes", "cause_medias")
