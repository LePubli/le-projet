"""saved_filters table for user-saved list filters

Revision ID: 0014
Revises: 0013
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent : vérifier si la table existe déjà (cas où le SQL a été joué manuellement)
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'saved_filters')"
    )).scalar()
    if result:
        print("Table saved_filters already exists, skipping CREATE")
    else:
        op.create_table(
            "saved_filters",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("entity", sa.String(50), nullable=False),
            sa.Column("filters", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_saved_filters_user_entity", "saved_filters", ["user_id", "entity"])


def downgrade() -> None:
    op.drop_index("ix_saved_filters_user_entity", table_name="saved_filters")
    op.drop_table("saved_filters")
