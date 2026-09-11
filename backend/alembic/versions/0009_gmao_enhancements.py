"""GMAO enhancements : heures fonctionnement, timer interventions, checklists sécurité.

Revision ID: 0009_gmao_enhancements
Revises: 0008_seed_equipment
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009_gmao_enhancements"
down_revision = "0008_seed_equipment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Ajouter heures_fonctionnement aux machines
    op.add_column(
        "machines",
        sa.Column("heures_fonctionnement", sa.Float(), nullable=True, server_default="0"),
    )

    # 2. Ajouter timer (started_at, ended_at) et checklist_data aux interventions
    op.add_column(
        "interventions",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "interventions",
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "interventions",
        sa.Column("checklist_data", postgresql.JSON(), server_default="[]"),
    )

    # 3. Ajouter duplique_de_id aux interventions (self-referencing FK)
    op.add_column(
        "interventions",
        sa.Column(
            "duplique_de_id",
            sa.Integer(),
            sa.ForeignKey("interventions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # 4. Créer la table safety_checklists
    op.create_table(
        "safety_checklists",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("titre", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("etapes", postgresql.JSON(), server_default="[]", nullable=False),
        sa.Column("zone", sa.String(), nullable=True),
        sa.Column("type_equip", sa.String(), nullable=True),
        sa.Column("actif", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # 5. Créer la table intervention_checklists
    op.create_table(
        "intervention_checklists",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "intervention_id",
            sa.Integer(),
            sa.ForeignKey("interventions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "checklist_id",
            sa.Integer(),
            sa.ForeignKey("safety_checklists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("etapes_cochees", postgresql.JSON(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("intervention_checklists")
    op.drop_table("safety_checklists")
    op.drop_column("interventions", "duplique_de_id")
    op.drop_column("interventions", "checklist_data")
    op.drop_column("interventions", "ended_at")
    op.drop_column("interventions", "started_at")
    op.drop_column("machines", "heures_fonctionnement")