"""api_tokens table + audit trail changes column

Revision ID: 0016
Revises: 0015
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # api_tokens table
    conn = op.get_bind()
    exists = conn.execute(sa.text(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'api_tokens')"
    )).scalar()
    if not exists:
        op.create_table(
            "api_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("token", sa.String(64), unique=True, nullable=False, index=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("last_used", sa.DateTime(timezone=True), nullable=True),
        )

    # Audit trail: add changes column to activity_logs
    col_exists = conn.execute(sa.text(
        "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'changes')"
    )).scalar()
    if not col_exists:
        op.add_column("activity_logs", sa.Column("changes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("activity_logs", "changes")
    op.drop_table("api_tokens")
