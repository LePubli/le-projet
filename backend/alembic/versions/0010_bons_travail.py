"""Bons de Travail – Entretien & Nettoyage (style TRIselec)

Tables : bons_travail, bt_gammes, bt_pieces, bt_compteurs, bt_visa
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_bons_travail"
down_revision = "0009_gmao_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bons_travail",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("numero", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("type_bt", sa.String(20), nullable=False, server_default="entretien"),
        sa.Column("statut", sa.String(20), nullable=False, server_default="à faire"),
        sa.Column("titre", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("arborescence", sa.Text(), nullable=True),
        sa.Column("date_creation", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("date_debut_prevue", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_debut_reelle", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_fin_prevue", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_cloture", sa.DateTime(timezone=True), nullable=True),
        sa.Column("demandeur_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("intervenant_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("degre_urgence", sa.String(20), nullable=True),
        sa.Column("famille", sa.String(50), nullable=True),
        sa.Column("duree_immobilisation_h", sa.Float(), nullable=True, server_default="0"),
        sa.Column("cout_total", sa.Float(), nullable=True, server_default="0"),
        sa.Column("temps_reaction_h", sa.Float(), nullable=True, server_default="0"),
        sa.Column("compte_rendu", sa.Text(), nullable=True),
        sa.Column("calendrier_id", sa.Integer(), nullable=True),
    )

    op.create_table(
        "bt_gammes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bt_id", sa.Integer(), sa.ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ordre", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("code_gamme", sa.String(50), nullable=True),
        sa.Column("famille_gamme", sa.String(50), nullable=True),
        sa.Column("texte_gamme", sa.Text(), nullable=False),
        sa.Column("consignation", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("condamnation", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("completed", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("duree_estimee_h", sa.Float(), nullable=True),
    )

    op.create_table(
        "bt_pieces",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bt_id", sa.Integer(), sa.ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("designation", sa.String(200), nullable=True),
        sa.Column("quantite", sa.Integer(), nullable=True, server_default="1"),
        sa.Column("cout_unitaire", sa.Float(), nullable=True, server_default="0"),
        sa.Column("cout_ligne", sa.Float(), nullable=True, server_default="0"),
    )

    op.create_table(
        "bt_compteurs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bt_id", sa.Integer(), sa.ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nom_compteur", sa.String(100), nullable=True),
        sa.Column("valeur", sa.Float(), nullable=True),
        sa.Column("cumul", sa.Float(), nullable=True),
        sa.Column("releve", sa.Float(), nullable=True),
        sa.Column("val_courante", sa.Float(), nullable=True),
    )

    op.create_table(
        "bt_visa",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bt_id", sa.Integer(), sa.ForeignKey("bons_travail.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("nom", sa.String(100), nullable=True),
        sa.Column("visa", sa.String(500), nullable=True),
        sa.Column("date_visa", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("bt_visa")
    op.drop_table("bt_compteurs")
    op.drop_table("bt_pieces")
    op.drop_table("bt_gammes")
    op.drop_table("bons_travail")