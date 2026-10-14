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
