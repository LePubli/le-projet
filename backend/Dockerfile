FROM python:3.11-slim

WORKDIR /app

# Install system deps:
# - libpq5: psycopg2 runtime
# - curl: healthcheck
# - postgresql-client: pg_dump for automated backups
# - cron: cron scheduler for daily backups (Debian's cron, pas dcron qui n'existe pas en Trixie)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    postgresql-client \
    cron \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh && mkdir -p /data/uploads /data/backups

# Healthcheck via l'endpoint /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
