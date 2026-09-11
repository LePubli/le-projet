"""Contraintes CHECK et CASCADE pour integrite DB

Ajoute :
- CHECK constraint sur pannes.criticite (1-5)
- CHECK constraint sur users.role (admin|manager|technicien)
- ondelete CASCADE sur pannes.machine_id
- ondelete CASCADE sur interventions.machine_id
- ondelete SET NULL sur interventions.panne_id
- ondelete CASCADE sur pannes_pieces.panne_id et piece_id
- PRIMARY KEY composite sur pannes_pieces(panne_id, piece_id)
- updated_at sur users

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-13 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006_constraints_cascade"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. CHECK constraints
    op.create_check_constraint(
        "ck_pannes_criticite",
        "pannes",
        "criticite IS NULL OR (criticite >= 1 AND criticite <= 5)",
    )
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('admin', 'manager', 'technicien')",
    )

    # 2. updated_at sur users (manquant depuis le debut)
    op.add_column(
        "users",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # 3. CASCADE sur les foreign keys
    # Note: PostgreSQL ne permet pas de modifier un FK existant directement,
    # il faut le dropper puis le recréer.

    # pannes.machine_id -> CASCADE
    op.drop_constraint("pannes_machine_id_fkey", "pannes", type_="foreignkey")
    op.create_foreign_key(
        "pannes_machine_id_fkey",
        "pannes",
        "machines",
        ["machine_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # interventions.machine_id -> CASCADE
    op.drop_constraint("interventions_machine_id_fkey", "interventions", type_="foreignkey")
    op.create_foreign_key(
        "interventions_machine_id_fkey",
        "interventions",
        "machines",
        ["machine_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # interventions.panne_id -> SET NULL (on garde l'intervention meme si panne supprimee)
    op.drop_constraint("interventions_panne_id_fkey", "interventions", type_="foreignkey")
    op.create_foreign_key(
        "interventions_panne_id_fkey",
        "interventions",
        "pannes",
        ["panne_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # pannes_pieces.panne_id -> CASCADE
    op.drop_constraint("pannes_pieces_panne_id_fkey", "pannes_pieces", type_="foreignkey")
    op.create_foreign_key(
        "pannes_pieces_panne_id_fkey",
        "pannes_pieces",
        "pannes",
        ["panne_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # pannes_pieces.piece_id -> RESTRICT (ne pas supprimer une piece utilisee)
    op.drop_constraint("pannes_pieces_piece_id_fkey", "pannes_pieces", type_="foreignkey")
    op.create_foreign_key(
        "pannes_pieces_piece_id_fkey",
        "pannes_pieces",
        "pieces",
        ["piece_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # 4. Index de performance sur colonnes frequentement filtree
    op.create_index("ix_pannes_criticite", "pannes", ["criticite"])
    op.create_index("ix_pannes_created_at", "pannes", ["created_at"])
    op.create_index("ix_interventions_date", "interventions", ["date_intervention"])


def downgrade() -> None:
    # Index
    op.drop_index("ix_interventions_date", "interventions")
    op.drop_index("ix_pannes_created_at", "pannes")
    op.drop_index("ix_pannes_criticite", "pannes")

    # FK restaurées sans CASCADE
    op.drop_constraint("pannes_pieces_piece_id_fkey", "pannes_pieces", type_="foreignkey")
    op.create_foreign_key(
        "pannes_pieces_piece_id_fkey",
        "pannes_pieces",
        "pieces",
        ["piece_id"],
        ["id"],
    )
    op.drop_constraint("pannes_pieces_panne_id_fkey", "pannes_pieces", type_="foreignkey")
    op.create_foreign_key(
        "pannes_pieces_panne_id_fkey",
        "pannes_pieces",
        "pannes",
        ["panne_id"],
        ["id"],
    )
    op.drop_constraint("interventions_panne_id_fkey", "interventions", type_="foreignkey")
    op.create_foreign_key(
        "interventions_panne_id_fkey",
        "interventions",
        "pannes",
        ["panne_id"],
        ["id"],
    )
    op.drop_constraint("interventions_machine_id_fkey", "interventions", type_="foreignkey")
    op.create_foreign_key(
        "interventions_machine_id_fkey",
        "interventions",
        "machines",
        ["machine_id"],
        ["id"],
    )
    op.drop_constraint("pannes_machine_id_fkey", "pannes", type_="foreignkey")
    op.create_foreign_key(
        "pannes_machine_id_fkey",
        "pannes",
        "machines",
        ["machine_id"],
        ["id"],
    )

    # Colonne updated_at sur users
    op.drop_column("users", "updated_at")

    # CHECK constraints
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.drop_constraint("ck_pannes_criticite", "pannes", type_="check")
