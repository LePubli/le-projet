#!/bin/bash
set -e

echo "=== TriMaint Backend ==="

# Vérification des variables obligatoires
if [ -z "$SECRET_KEY" ]; then
    echo "ERREUR FATALE: SECRET_KEY non défini. Abandon."
    exit 1
fi
if [ -z "$DATABASE_URL" ]; then
    echo "ERREUR FATALE: DATABASE_URL non défini. Abandon."
    exit 1
fi

echo "Attente de PostgreSQL..."

# Attendre que PostgreSQL soit prêt
until python -c "
import psycopg2, os, sys
try:
    psycopg2.connect(os.environ['DATABASE_URL'])
    sys.exit(0)
except Exception as e:
    print(f'  PostgreSQL non disponible: {e}')
    sys.exit(1)
"; do
    sleep 2
done

echo "PostgreSQL prêt."

# Fix stale alembic_version if DB was partially upgraded with old revision IDs.
# The project changed its revision-ID convention twice:
#   - up to 0005: numeric IDs ("0004", "0005")
#   - 0006 onwards: full names ("0006_constraints_cascade", "0010_bons_travail", ...)
#   - 0011/0012: short numeric IDs again ("0011", "0012") to keep the chain
#     consistent with 0001-0005.
# If a DB recorded a revision ID that no longer exists in the migrations folder
# (e.g. "0011_taille_pastille_float" from a previous broken deploy), Alembic
# raises KeyError. We patch alembic_version to the closest valid upstream ID.
python -c "
import psycopg2, os
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute('SELECT version_num FROM alembic_version')
row = cur.fetchone()
if row:
    v = row[0]
    fixes = {
        '0006': '0006_constraints_cascade',
        '0011_taille_pastille_float': '0011',
        '0012_panne_medias': '0012',
    }
    if v in fixes:
        cur.execute('UPDATE alembic_version SET version_num = %s', (fixes[v],))
        conn.commit()
        print(f'Fixed alembic_version: {v} -> {fixes[v]}')
cur.close()
conn.close()
" 2>/dev/null || true

# Ajout idempotent de la colonne rotation (supprimée de la migration 0008)
python -c "
import psycopg2, os
conn = psycopg2.connect(os.environ['DATABASE_URL'])
conn.autocommit = True
cur = conn.cursor()
cur.execute(\"SELECT column_name FROM information_schema.columns WHERE table_name='machines' AND column_name='rotation'\")
if not cur.fetchone():
    cur.execute('ALTER TABLE machines ADD COLUMN rotation FLOAT')
    print('Colonne rotation ajoutée à machines.')
else:
    print('Colonne rotation déjà présente.')
cur.close(); conn.close()
"

echo "Exécution des migrations Alembic..."
alembic upgrade head
echo "Migrations terminées."

# Seed equipment data (idempotent - skips if already present)
echo "Vérification du seed des équipements..."
python -c "from seed_equipment import seed_equipment; seed_equipment()" || echo "Seed skipped (may already exist)"

# Gunicorn en production (2-4 workers selon CPU)
WORKERS=${GUNICORN_WORKERS:-2}
echo "Démarrage du serveur (gunicorn, $WORKERS workers)..."

# Planifier la sauvegarde DB quotidienne (si BACKUP_ENABLED=1)
if [ "${BACKUP_ENABLED:-0}" = "1" ]; then
  BACKUP_HOUR=${BACKUP_HOUR:-02}
  BACKUP_MINUTE=${BACKUP_MINUTE:-00}
  # Debian's cron : crontab dans /etc/cron.d/ (format: m h dom mon dow user cmd)
  echo "${BACKUP_MINUTE} ${BACKUP_HOUR} * * * root cd /app && python backup_db.py >> /var/log/trimaint-backup.log 2>&1" > /etc/cron.d/trimaint-backup
  chmod 0644 /etc/cron.d/trimaint-backup
  # Lancer cron en arrière-plan (Debian's cron daemon, pas dcron)
  cron -f &
  echo "Sauvegarde DB planifiée tous les jours à ${BACKUP_HOUR}h${BACKUP_MINUTE} (BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30})"
  # Sauvegarde initiale au démarrage (pour valider que ça marche)
  echo "Sauvegarde initiale..."
  python backup_db.py || echo "Sauvegarde initiale échouée (non bloquant)"
fi

exec gunicorn app.main:app \
    --workers "$WORKERS" \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile -
