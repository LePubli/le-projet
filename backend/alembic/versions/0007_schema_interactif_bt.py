"""Ajout etage aux machines, type_bt/statut aux interventions, table convoyeurs.

Revision ID: 0007_schema_interactif_bt
Revises: 0006_constraints_cascade
Create Date: 2026-07-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_schema_interactif_bt"
down_revision = "0006_constraints_cascade"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Ajouter etage aux machines
    op.add_column("machines", sa.Column("etage", sa.Integer(), nullable=True, default=0))

    # 2. Ajouter type_bt et statut aux interventions
    op.add_column("interventions", sa.Column("type_bt", sa.String(), server_default="reparation"))
    op.add_column("interventions", sa.Column("statut", sa.String(), server_default="en_cours"))

    # 3. Créer la table convoyeurs
    op.create_table(
        "convoyeurs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("nom", sa.String(), nullable=False),
        sa.Column("code_interne", sa.String(), unique=True, index=True),
        sa.Column("ligne", sa.String()),
        sa.Column("zone", sa.String()),
        sa.Column("etage", sa.Integer(), nullable=True, default=0),
        sa.Column("type_convoyeur", sa.String(), server_default="bande"),
        sa.Column("source_machine_id", sa.Integer(), sa.ForeignKey("machines.id"), nullable=True),
        sa.Column("target_machine_id", sa.Integer(), sa.ForeignKey("machines.id"), nullable=True),
        sa.Column("statut", sa.String(), server_default="operationnel"),
        sa.Column("longueur_m", sa.Float(), nullable=True),
        sa.Column("vitesse", sa.String(), nullable=True),
        sa.Column("path_points", postgresql.JSON(), server_default="[]"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )


def downgrade():
    op.drop_table("convoyeurs")
    op.drop_column("interventions", "statut")
    op.drop_column("interventions", "type_bt")
    op.drop_column("machines", "etage")