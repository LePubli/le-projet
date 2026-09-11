"""Consolidate role manager into chef_equipe

Revision ID: 0019
Revises: 0018
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE users SET role = 'chef_equipe' WHERE role = 'manager'"))


def downgrade() -> None:
    # Lossy: cannot distinguish former managers from chef_equipe users created after the upgrade.
    op.execute(sa.text("UPDATE users SET role = 'manager' WHERE role = 'chef_equipe'"))
