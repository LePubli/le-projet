"""push_subscriptions table for Web Push notifications

Revision ID: 0015
Revises: 0014
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent : vérifier si la table existe déjà
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'push_subscriptions')"
    )).scalar()
    if result:
        print("Table push_subscriptions already exists, skipping CREATE")
    else:
        op.create_table(
            "push_subscriptions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), nullable=False, index=True),
            sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
            sa.Column("p256dh", sa.String(200), nullable=False),
            sa.Column("auth", sa.String(100), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("push_subscriptions")
