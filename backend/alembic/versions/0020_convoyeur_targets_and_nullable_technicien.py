"""Convoyeur as alternate target for panne/intervention/maintenance_preventive,
technicien nullable on intervention, target_roles on notifications

Revision ID: 0020
Revises: 0019
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TARGET_TABLES = ("pannes", "interventions", "maintenances_preventives")


def _column_exists(conn, table, col) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT EXISTS (SELECT FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :col)"
            ),
            {"table": table, "col": col},
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()

    for table in TARGET_TABLES:
        if not _column_exists(conn, table, "convoyeur_id"):
            op.add_column(table, sa.Column("convoyeur_id", sa.Integer(), nullable=True))
            op.create_foreign_key(
                f"fk_{table}_convoyeur_id", table, "convoyeurs", ["convoyeur_id"], ["id"]
            )
        op.alter_column(table, "machine_id", nullable=True)

    op.alter_column("interventions", "technicien", nullable=True)

    if not _column_exists(conn, "notifications", "target_roles"):
        op.add_column("notifications", sa.Column("target_roles", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("notifications", "target_roles")
    op.alter_column("interventions", "technicien", nullable=False)
    for table in TARGET_TABLES:
        op.alter_column(table, "machine_id", nullable=False)
        op.drop_constraint(f"fk_{table}_convoyeur_id", table, type_="foreignkey")
        op.drop_column(table, "convoyeur_id")
