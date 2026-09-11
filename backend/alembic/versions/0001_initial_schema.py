"""initial schema

Revision ID: 0001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # --- machines ---
    op.create_table(
        "machines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nom", sa.String(), nullable=False),
        sa.Column("site", sa.String(), nullable=True),
        sa.Column("ligne", sa.String(), nullable=True),
        sa.Column("zone", sa.String(), nullable=True),
        sa.Column("fabricant", sa.String(), nullable=True),
        sa.Column("modele", sa.String(), nullable=True),
        sa.Column("code_interne", sa.String(), nullable=True),
        sa.Column("statut", sa.String(), nullable=True),
        sa.Column("qr_code", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_machines_code_interne"), "machines", ["code_interne"], unique=True)
    op.create_index(op.f("ix_machines_id"), "machines", ["id"], unique=False)

    # --- pannes ---
    op.create_table(
        "pannes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("titre", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("causes_possibles", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("cause_reelle", sa.Text(), nullable=True),
        sa.Column("solution", sa.Text(), nullable=True),
        sa.Column("criticite", sa.Integer(), nullable=True),
        sa.Column("temps_moyen_reparation", sa.Integer(), nullable=True),
        sa.Column("photos", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pannes_id"), "pannes", ["id"], unique=False)

    # --- pieces ---
    op.create_table(
        "pieces",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(), nullable=False),
        sa.Column("nom", sa.String(), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=True),
        sa.Column("emplacement", sa.String(), nullable=True),
        sa.Column("fournisseur", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pieces_id"), "pieces", ["id"], unique=False)
    op.create_index(op.f("ix_pieces_reference"), "pieces", ["reference"], unique=True)

    # --- interventions ---
    op.create_table(
        "interventions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("panne_id", sa.Integer(), nullable=True),
        sa.Column("technicien", sa.String(), nullable=False),
        sa.Column("duree", sa.Integer(), nullable=True),
        sa.Column("commentaire", sa.Text(), nullable=True),
        sa.Column("photos_avant", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("photos_apres", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("validee", sa.Boolean(), nullable=True),
        sa.Column("validee_par", sa.String(), nullable=True),
        sa.Column("date_intervention", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["panne_id"], ["pannes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interventions_id"), "interventions", ["id"], unique=False)

    # --- pannes_pieces ---
    op.create_table(
        "pannes_pieces",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("panne_id", sa.Integer(), nullable=True),
        sa.Column("piece_id", sa.Integer(), nullable=True),
        sa.Column("quantite", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["panne_id"], ["pannes.id"]),
        sa.ForeignKeyConstraint(["piece_id"], ["pieces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("pannes_pieces")
    op.drop_index(op.f("ix_interventions_id"), table_name="interventions")
    op.drop_table("interventions")
    op.drop_index(op.f("ix_pieces_reference"), table_name="pieces")
    op.drop_index(op.f("ix_pieces_id"), table_name="pieces")
    op.drop_table("pieces")
    op.drop_index(op.f("ix_pannes_id"), table_name="pannes")
    op.drop_table("pannes")
    op.drop_index(op.f("ix_machines_id"), table_name="machines")
    op.drop_index(op.f("ix_machines_code_interne"), table_name="machines")
    op.drop_table("machines")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
