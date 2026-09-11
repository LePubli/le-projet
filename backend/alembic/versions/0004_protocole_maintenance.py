"""protocole reparation et maintenances preventives

Revision ID: 0004
Revises: 0003
Create Date: 2024-01-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pannes", sa.Column("protocole_reparation", sa.Text(), nullable=True))
    op.create_table(
        "maintenances_preventives",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("titre", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("frequence_jours", sa.Integer(), nullable=False),
        sa.Column("derniere_execution", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsable", sa.String(), nullable=True),
        sa.Column("alert_jours", sa.Integer(), server_default="7"),
        sa.Column("actif", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("maintenances_preventives")
    op.drop_column("pannes", "protocole_reparation")
