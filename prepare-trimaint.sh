#!/usr/bin/env bash
#
# prepare-trimaint.sh
# ==============================================================================
# Prépare tout ce dont DockPanel a besoin pour déployer TriMaint :
#
#   1. Nettoie les restes des tentatives précédentes
#   2. Construit les images Docker (trimaint-backend:prod, trimaint-frontend:prod)
#   3. Génère un .env avec de vrais secrets
#   4. Démarre Postgres seul et restaure le dump de production
#   5. Affiche le YAML et les variables à coller dans DockPanel
#
# À exécuter UNE FOIS en SSH. Les déploiements suivants se font depuis
# l'interface DockPanel.
#
# Usage :
#   sudo bash prepare-trimaint.sh /chemin/vers/TriMaint-main /chemin/vers/trimaint.sql
#
# ==============================================================================
set -euo pipefail

SRC_DIR="${1:-/root/apps/TriMaint-main}"
DUMP_FILE="${2:-/root/apps/trimaint.sql}"
WORK_DIR="/root/apps/trimaint-prod"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[1;34m'; NC='\033[0m'
log()  { echo -e "\n${BLUE}[+] $*${NC}"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
die()  { echo -e "${RED}  ✗ $*${NC}" >&2; exit 1; }

# --- Vérifications préalables -------------------------------------------------
[[ -d "${SRC_DIR}" ]]     || die "Sources introuvables : ${SRC_DIR}"
[[ -f "${DUMP_FILE}" ]]   || die "Dump introuvable : ${DUMP_FILE}"
[[ -f "${SRC_DIR}/backend/Dockerfile" ]]  || die "backend/Dockerfile absent de ${SRC_DIR}"
[[ -f "${SRC_DIR}/frontend/Dockerfile" ]] || die "frontend/Dockerfile absent de ${SRC_DIR}"

# =============================================================================
log "1/5 — Nettoyage des tentatives précédentes"
# =============================================================================
# Les essais Git Deploy / Compose Stack ont pu laisser des conteneurs et
# volumes orphelins qui entreraient en conflit (mêmes noms de conteneurs).
for c in trimaint_db trimaint_backend trimaint_frontend \
         dockpanel-git-trimaint-backend dockpanel-git-trimaint-frontend; do
  if docker ps -a --format '{{.Names}}' | grep -qx "${c}"; then
    docker rm -f "${c}" >/dev/null 2>&1 && ok "Conteneur supprimé : ${c}"
  fi
done

# L'ancien projet compose (dossier /root/apps/trimaint) s'il existe
if [[ -f /root/apps/trimaint/docker-compose.yml ]]; then
  (cd /root/apps/trimaint && docker compose down -v >/dev/null 2>&1) || true
  ok "Ancien projet compose arrêté et ses volumes supprimés"
fi

# Volumes de l'ancienne tentative (préfixés par le nom de dossier)
for v in trimaint_postgres_data trimaint_uploads_data trimaint_backups_data; do
  docker volume rm "${v}" >/dev/null 2>&1 && ok "Volume réinitialisé : ${v}" || true
done

# =============================================================================
log "2/5 — Construction des images Docker"
# =============================================================================
warn "Le build du frontend (npm + vite) prend plusieurs minutes."

docker build -t trimaint-backend:prod "${SRC_DIR}/backend"
ok "Image construite : trimaint-backend:prod"

docker build -t trimaint-frontend:prod "${SRC_DIR}/frontend"
ok "Image construite : trimaint-frontend:prod"

# =============================================================================
log "3/5 — Génération du fichier .env"
# =============================================================================
mkdir -p "${WORK_DIR}"
cp "$(dirname "$0")/docker-compose.yml" "${WORK_DIR}/docker-compose.yml"

POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
SECRET_KEY="$(openssl rand -hex 32)"

cat > "${WORK_DIR}/.env" << EOF
# Généré automatiquement par prepare-trimaint.sh le $(date '+%Y-%m-%d %H:%M:%S')
# Ne pas committer ce fichier.

POSTGRES_DB=trimaint
POSTGRES_USER=trimaint
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

SECRET_KEY=${SECRET_KEY}

ALLOWED_ORIGINS=https://triselec.le-publicitaire.fr

MAX_UPLOAD_SIZE=62914560
ACCESS_TOKEN_EXPIRE_MINUTES=480
GUNICORN_WORKERS=2
LOGIN_RATE_LIMIT=5/minute

# La base restaurée contient déjà les comptes utilisateurs : pas de bootstrap.
BOOTSTRAP_ADMIN=0

BACKUP_ENABLED=1
BACKUP_HOUR=02
BACKUP_MINUTE=00
BACKUP_RETENTION_DAYS=30

LOG_FORMAT=json
LOG_LEVEL=INFO
EOF

chmod 600 "${WORK_DIR}/.env"
ok "Fichier .env généré dans ${WORK_DIR}"

# =============================================================================
log "4/5 — Restauration du dump de production"
# =============================================================================
cd "${WORK_DIR}"

# On démarre Postgres seul : le backend ne doit pas tourner pendant la
# restauration (il tenterait des migrations sur une base en cours d'import).
docker compose up -d postgres
ok "Postgres démarré, attente du healthcheck..."

for i in {1..30}; do
  if docker exec trimaint_db pg_isready -U trimaint -d trimaint >/dev/null 2>&1; then
    ok "Postgres prêt"
    break
  fi
  sleep 2
  [[ $i -eq 30 ]] && die "Postgres n'est pas devenu disponible"
done

# Le dump vient d'un pg_dump --clean --if-exists : il gère lui-même la
# suppression des objets existants. Les erreurs sur objets absents (base
# vierge) sont normales et non bloquantes.
docker exec -i trimaint_db psql -U trimaint -d trimaint < "${DUMP_FILE}" \
  > /tmp/restore-trimaint.log 2>&1 || warn "psql a signalé des erreurs (voir /tmp/restore-trimaint.log)"

# Vérification réelle : on compte les tables plutôt que de se fier au code retour
TABLE_COUNT=$(docker exec trimaint_db psql -U trimaint -d trimaint -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
ALEMBIC_VER=$(docker exec trimaint_db psql -U trimaint -d trimaint -tAc \
  "SELECT version_num FROM alembic_version" 2>/dev/null || echo "absente")

if [[ "${TABLE_COUNT}" -lt 20 ]]; then
  die "Restauration incomplète : seulement ${TABLE_COUNT} tables (22 attendues). Voir /tmp/restore-trimaint.log"
fi

ok "${TABLE_COUNT} tables restaurées"
ok "Version Alembic en base : ${ALEMBIC_VER}"

# Contrôle des colonnes qui posaient problème lors des migrations from scratch
for col in rotation taille_pastille; do
  PRESENT=$(docker exec trimaint_db psql -U trimaint -d trimaint -tAc \
    "SELECT count(*) FROM information_schema.columns WHERE table_name='machines' AND column_name='${col}'")
  [[ "${PRESENT}" == "1" ]] && ok "Colonne machines.${col} présente" \
                            || warn "Colonne machines.${col} ABSENTE"
done

USER_COUNT=$(docker exec trimaint_db psql -U trimaint -d trimaint -tAc \
  "SELECT count(*) FROM users" 2>/dev/null || echo "?")
MACHINE_COUNT=$(docker exec trimaint_db psql -U trimaint -d trimaint -tAc \
  "SELECT count(*) FROM machines" 2>/dev/null || echo "?")
ok "Données : ${USER_COUNT} utilisateur(s), ${MACHINE_COUNT} machine(s)"

# =============================================================================
log "5/5 — Démarrage complet et vérification"
# =============================================================================
docker compose up -d
sleep 25

docker compose ps

echo
if curl -sf -o /dev/null http://127.0.0.1:7001; then
  ok "Frontend accessible sur http://127.0.0.1:7001"
else
  warn "Frontend pas encore accessible — vérifier : docker compose logs frontend"
fi

if docker exec trimaint_backend curl -sf -o /dev/null http://localhost:8000/api/health 2>/dev/null; then
  ok "Backend en bonne santé (/api/health)"
else
  warn "Backend pas encore prêt — vérifier : docker compose logs backend --tail 40"
fi

# =============================================================================
cat << EOF

╔══════════════════════════════════════════════════════════════════════════╗
║  PRÉPARATION TERMINÉE                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

  Répertoire de travail : ${WORK_DIR}

  PROCHAINES ÉTAPES DANS DOCKPANEL :

  1) Docker Apps -> Deploy Custom Stack
     Coller le contenu de :
       ${WORK_DIR}/docker-compose.yml

  2) Variables d'environnement — coller le contenu de :
       ${WORK_DIR}/.env
     (bouton "Paste .env" si disponible)

  3) Sites -> New Site -> Reverse Proxy
       Domaine : triselec.le-publicitaire.fr
       Cible   : 127.0.0.1:7001
       SSL     : activer Let's Encrypt

     Vérifier d'abord le DNS :
       dig +short triselec.le-publicitaire.fr @8.8.8.8
     doit retourner l'IP du serveur.

  4) Réactiver la surveillance de sécurité sur les uploads :
     voir la section correspondante du README.

  COMMANDES UTILES :

    cd ${WORK_DIR}
    docker compose ps
    docker compose logs backend --tail 40
    docker compose restart backend

  Les secrets générés sont dans ${WORK_DIR}/.env (permissions 600).

EOF
