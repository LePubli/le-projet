"""Add latitude/longitude columns to machines

Revision ID: 0017
Revises: 0016
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    for col in ["latitude", "longitude"]:
        exists = conn.execute(sa.text(
            f"SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'machines' AND column_name = '{col}')"
        )).scalar()
        if not exists:
            op.add_column("machines", sa.Column(col, sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("machines", "longitude")
    op.drop_column("machines", "latitude")
