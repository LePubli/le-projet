"""Seed script: inserts 314 equipment into machines table.
Run via entrypoint.sh after alembic upgrade head.
QR codes are generated on-demand via the API, NOT here (too slow for startup).
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def seed_equipment():
    try:
        from app.db.database import SessionLocal
        from app.models.machine import Machine
    except Exception as e:
        print(f"Seed: cannot import app modules ({e}), skipping")
        return

    db = SessionLocal()
    try:
        existing = db.query(Machine).filter(Machine.site == "Triselec").count()
        if existing >= 300:
            print(f"Seed skipped: {existing} Triselec equipment already exist")
            return

        seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alembic", "seed_data", "equipment.json")
        if not os.path.exists(seed_path):
            print(f"Seed: file not found at {seed_path}, skipping")
            return

        with open(seed_path) as f:
            equipment = json.load(f)

        count = 0
        for eq in equipment:
            exists = db.query(Machine).filter(Machine.code_interne == eq["code_interne"]).first()
            if exists:
                continue
            machine = Machine(
                nom=eq["nom"],
                code_interne=eq["code_interne"],
                site="Triselec",
                ligne=eq["ligne"],
                zone=eq["zone"],
                etage=eq["etage"],
                fabricant=None,
                modele=eq.get("type_equip", "equipement"),
                statut="operationnel",
                notes=f"Equipement {eq.get('type_equip', 'generique')} du process de tri",
                pos_x=eq["pos_x"],
                pos_y=eq["pos_y"],
            )
            db.add(machine)
            count += 1
            if count % 50 == 0:
                db.flush()
                print(f"  Seed: {count}/{len(equipment)}...")

        db.commit()
        print(f"Seed complete: {count} equipment inserted")

    except Exception as e:
        print(f"Seed error (non-fatal): {e}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        try:
            db.close()
        except Exception:
            pass


if __name__ == "__main__":
    seed_equipment()