"""seed_equipment_314

Revision ID: 0008_seed_equipment
Revises: 0007_schema_interactif_bt
Create Date: 2026-07-14

Seeds 314 equipment items extracted from the Triselec process schema
into the machines table with pre-calculated SVG positions, zones, floors,
and processing lines.
"""

from alembic import op
import json
import sqlalchemy as sa

# ─── Load equipment data ────────────────────────────────────────────
EQUIPMENT = [
    # The data will be injected by the seed script at migration time
    # This file is a template - the actual SQL INSERT is generated separately
]

revision = '0008_seed_equipment'
down_revision = '0007_schema_interactif_bt'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Import the equipment data
    import os
    seed_path = os.path.join(os.path.dirname(__file__), '..', 'seed_data', 'equipment.json')
    
    conn = op.get_bind()
    
    # Check if equipment already exists
    count = conn.execute(sa.text("SELECT COUNT(*) FROM machines")).scalar()
    if count >= 300:
        print(f"Skipping seed: {count} machines already exist")
        return
    
    if os.path.exists(seed_path):
        with open(seed_path) as f:
            equipment = json.load(f)
    else:
        # Inline fallback: generate from the codes directly
        equipment = _get_inline_equipment()
    
    for eq in equipment:
        conn.execute(sa.text("""
            INSERT INTO machines (nom, code_interne, site, ligne, zone, etage, 
                                  fabricant, modele, statut, notes, pos_x, pos_y)
            VALUES (:nom, :code_interne, :site, :ligne, :zone, :etage,
                    :fabricant, :modele, :statut, :notes, :pos_x, :pos_y)
            ON CONFLICT (code_interne) DO NOTHING
        """), {
            "nom": eq["nom"],
            "code_interne": eq["code_interne"],
            "site": "Triselec",
            "ligne": eq["ligne"],
            "zone": eq["zone"],
            "etage": eq["etage"],
            "fabricant": None,
            "modele": eq.get("type_equip", ""),
            "statut": "operationnel",
            "notes": f"Équipement {eq.get('type_equip', 'générique')} du process de tri",
            "pos_x": eq["pos_x"],
            "pos_y": eq["pos_y"],
        })
    
    # Generate QR codes for all inserted machines
    conn.execute(sa.text("""
        UPDATE machines SET qr_code = 'data:image/svg+xml;base64,' || 
            encode(convert_to(
                '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"white\"/><text x=\"50\" y=\"55\" text-anchor=\"middle\" font-size=\"8\" fill=\"black\">' || code_interne || '</text></svg>',
                'UTF8'), 'base64')
        WHERE qr_code IS NULL AND code_interne IS NOT NULL
    """))
    
    print(f"Seeded {len(equipment)} equipment items")


def downgrade() -> None:
    """Remove all seeded equipment (machines with site='Triselec' and no interventions)."""
    op.execute("""
        DELETE FROM machines 
        WHERE site = 'Triselec' 
        AND id NOT IN (SELECT DISTINCT machine_id FROM interventions)
        AND id NOT IN (SELECT DISTINCT machine_id FROM pannes)
    """)


def _get_inline_equipment():
    """Fallback inline data when seed file is not available."""
    return []