"""taille_pastille: INTEGER (em*10) -> FLOAT (raw em)

Converts machines.taille_pastille from the legacy em*10 INTEGER convention
to a raw-em FLOAT, matching the frontend (SchemaInteractif.tsx) which now
sends fractional values like 0.9 or 1.4.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-24 00:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0011"
down_revision: Union[str, None] = "0010_bons_travail"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sur une base vierge, ni `couleur` ni `taille_pastille` n'existent : ces
    # colonnes ont historiquement été ajoutées à la main en prod (voir
    # migration_v23.sql), jamais via Alembic. On les crée ici directement au
    # bon type si absentes, et la conversion ci-dessous devient un no-op.
    conn = op.get_bind()
    exists = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='machines' AND column_name='taille_pastille'"
        )
    ).fetchone()
    if not exists:
        op.add_column("machines", sa.Column("couleur", sa.String(7), nullable=True))
        op.add_column("machines", sa.Column("taille_pastille", sa.Float(), nullable=True))
        return

    # 1) Convert legacy em*10 values (integer in [1, 19]) to raw em (divide by 10).
    #    Floats and integers >= 20 are assumed to already be raw em.
    op.execute(
        """
        UPDATE machines
           SET taille_pastille = taille_pastille::float / 10.0
         WHERE taille_pastille IS NOT NULL
           AND taille_pastille = FLOOR(taille_pastille)::int
           AND taille_pastille BETWEEN 1 AND 19
        """
    )
    # 2) Widen the column to FLOAT (DOUBLE PRECISION on Postgres).
    op.alter_column(
        "machines",
        "taille_pastille",
        existing_type=sa.Integer(),
        type_=sa.Float(),
        existing_nullable=True,
        postgresql_using="taille_pastille::DOUBLE PRECISION",
    )


def downgrade() -> None:
    # NB: downgrade is lossy — fractional values are rounded to the nearest int*10.
    op.execute(
        """
        UPDATE machines
           SET taille_pastille = ROUND(taille_pastille::float * 10)::int
         WHERE taille_pastille IS NOT NULL
        """
    )
    op.alter_column(
        "machines",
        "taille_pastille",
        existing_type=sa.Float(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using="taille_pastille::INTEGER",
    )
