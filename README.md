# TriMaint — déploiement sur DockPanel

Stack unique prête à coller dans DockPanel, avec restauration de la base de
production issue de Coolify.

---

## Pourquoi cette approche

Le `docker-compose.yml` du repo est écrit pour **Coolify + Traefik**. Deux
adaptations étaient nécessaires :

| Point | Coolify | DockPanel |
|---|---|---|
| Routage | Traefik rejoint le réseau Docker, `expose` suffit | nginx sur l'hôte, il faut un port **publié** |
| Build | Coolify build depuis les sources | Images construites une fois, référencées par tag |

Et surtout : **on restaure le dump de production au lieu de rejouer les
migrations**.

### Pourquoi c'est important

Tenter `alembic upgrade head` sur une base vierge échoue, pour deux raisons
présentes dans le code :

1. **`entrypoint.sh`** patche la table `machines` (colonne `rotation`) **avant**
   d'exécuter les migrations. Avec `set -e` actif, le script meurt sur une base
   vierge où la table n'existe pas encore.
2. **Migration `0011_taille_pastille_float`** fait un `UPDATE` sur la colonne
   `taille_pastille`, qui **n'est créée par aucune migration** — elle a été
   ajoutée manuellement en production sur l'ancien serveur.

Ces deux colonnes existent déjà dans le dump. Une fois la base restaurée,
`alembic upgrade head` est un no-op (la base est à la révision `0018`, comme le
code), et le bloc `rotation` trouve sa colonne. Aucun bug déclenché.

> **À corriger dans le repo à terme.** Tant que ces deux points ne sont pas
> réglés, le projet n'est pas déployable from scratch — seulement restaurable
> depuis un dump. Ça bloquera le jour où tu voudras une base de dev vierge ou
> un déploiement chez un autre client. Voir la section « Dette technique ».

---

## Prérequis

- VPS avec Docker et DockPanel installés
- Les sources du projet (dossier `TriMaint-main`)
- Le dump `trimaint.sql` (284 Ko, révision Alembic `0018`)
- ~3 Go d'espace libre pour les images

Le fichier `trimaint-roles.sql` n'est **pas** nécessaire : le rôle `trimaint`
est créé automatiquement par le conteneur Postgres via `POSTGRES_USER`.

---

## Installation

### 1. Transférer les fichiers sur le VPS

Depuis ton PC (PowerShell) :

```powershell
scp -r C:\Users\agenc\Downloads\TriMaint-main root@82.22.77.159:/root/apps/
scp C:\Users\agenc\Downloads\trimaint.sql root@82.22.77.159:/root/apps/
scp -r C:\Users\agenc\Downloads\trimaint-deploy root@82.22.77.159:/root/
```

### 2. Lancer la préparation

```bash
ssh root@82.22.77.159
cd /root/trimaint-deploy
chmod +x prepare-trimaint.sh
sudo bash prepare-trimaint.sh /root/apps/TriMaint-main /root/apps/trimaint.sql
```

Le script :
1. nettoie les conteneurs et volumes des tentatives précédentes
2. construit `trimaint-backend:prod` et `trimaint-frontend:prod`
3. génère un `.env` avec de vrais secrets
4. démarre Postgres seul et restaure le dump
5. vérifie l'intégrité (22 tables, colonnes critiques, comptages)
6. démarre la stack complète

⏱️ Compter 5 à 10 minutes, essentiellement le build npm du frontend.

### 3. Déployer dans DockPanel

**Docker Apps → Deploy Custom Stack**

Coller le contenu de :
```bash
cat /root/apps/trimaint-prod/docker-compose.yml
```

**Variables d'environnement** — bouton « Paste .env », coller :
```bash
cat /root/apps/trimaint-prod/.env
```

### 4. Attacher le domaine

Vérifier le DNS d'abord :
```bash
dig +short triselec.le-publicitaire.fr @8.8.8.8
```
Doit retourner `82.22.77.159`. Sinon, créer l'enregistrement A chez le
registrar avant de continuer.

Puis **Sites → New Site → Reverse Proxy** :

| Champ | Valeur |
|---|---|
| Domaine | `triselec.le-publicitaire.fr` |
| Cible | `127.0.0.1:7001` |
| SSL | Let's Encrypt activé |

> ⚠️ Attention à l'orthographe : une tentative précédente a créé un vhost
> `triselec.le-publicitiare.fr` (i/a inversés). Si ce fichier traîne encore :
> ```bash
> rm -f /etc/nginx/sites-enabled/triselec.le-publicitiare.fr.conf
> nginx -t && systemctl reload nginx
> ```

---

## Architecture déployée

```
Internet
   │  https://triselec.le-publicitaire.fr
   ▼
nginx (hôte, DockPanel) ── TLS Let's Encrypt
   │  proxy vers 127.0.0.1:7001
   ▼
┌─────────────── réseau trimaint_net ───────────────┐
│                                                    │
│  trimaint_frontend  (nginx:alpine, port 80)        │
│    ├── sert le build React (SPA)                   │
│    └── proxy /api/, /docs, /redoc ──┐              │
│                                      ▼             │
│  trimaint_backend   (FastAPI + gunicorn, :8000)    │
│    │  non publié sur l'hôte                        │
│    ▼                                               │
│  trimaint_db        (postgres:16-alpine, :5432)    │
│    │  non publié sur l'hôte                        │
└────┴───────────────────────────────────────────────┘

Volumes persistants :
  trimaint_postgres_data   base de données
  trimaint_uploads_data    fichiers uploadés (photos pannes, médias BT)
  trimaint_backups_data    sauvegardes automatiques quotidiennes (2h)
```

Un seul point d'entrée public. Backend et base ne sont joignables que depuis
le réseau interne Docker.

---

## Vérifications

```bash
cd /root/apps/trimaint-prod

docker compose ps                      # 3 conteneurs, postgres healthy
curl -sI http://127.0.0.1:7001         # doit répondre 200
docker compose logs backend --tail 30  # pas de boucle de redémarrage

# Contenu de la base
docker exec trimaint_db psql -U trimaint -d trimaint -c "\dt"
docker exec trimaint_db psql -U trimaint -d trimaint -c "SELECT count(*) FROM machines;"
docker exec trimaint_db psql -U trimaint -d trimaint -c "SELECT version_num FROM alembic_version;"
```

Dans les logs backend, tu dois voir :
```
Colonne rotation déjà présente.
Exécution des migrations Alembic...
Migrations terminées.
Démarrage du serveur (gunicorn, 2 workers)...
```

### Connexion à l'application

Les comptes utilisateurs viennent de la base restaurée — **utilise tes
identifiants habituels de l'ancien serveur**. `BOOTSTRAP_ADMIN` est
volontairement à `0` pour ne pas créer de compte parasite.

Si tu as perdu l'accès, réinitialise le mot de passe directement en base
plutôt que d'activer le bootstrap :
```bash
docker exec -it trimaint_db psql -U trimaint -d trimaint -c "SELECT id, email, role FROM users;"
```

---

## Mise à jour après un push GitHub

Ce déploiement n'a pas de webhook automatique (le stack est multi-services,
Git Deploy ne convient pas). La mise à jour se fait en trois commandes :

```bash
cd /root/apps/TriMaint-main && git pull
docker build -t trimaint-backend:prod ./backend
docker build -t trimaint-frontend:prod ./frontend
cd /root/apps/trimaint-prod && docker compose up -d
```

Ou dans DockPanel : **Redeploy** sur la stack, après avoir rebuild les images
en SSH.

> Le repo GitHub `LePubli/TriMaint` est actuellement **en retard** sur le zip
> fourni : sa branche `main` s'arrête aux migrations 0012, alors que ce code
> et la base sont en 0018. Pense à y pousser cette version avant de te reposer
> sur `git pull`.

---

## Sauvegardes

`BACKUP_ENABLED=1` : le backend dumpe la base chaque nuit à 2h dans le volume
`trimaint_backups_data`, avec 30 jours de rétention.

```bash
docker exec trimaint_backend ls -lh /data/backups/
```

⚠️ Ces sauvegardes vivent **sur le même serveur** que la base. Configure aussi
une destination externe dans **DockPanel → Backups** (S3, Backblaze B2, SFTP) —
une sauvegarde locale ne protège ni d'une perte de serveur ni d'une
compromission.

---

## Réactiver la surveillance de sécurité

Le volume d'uploads est un emplacement sensible : c'est là qu'un fichier
malveillant serait déposé en cas de faille d'upload. Une fois TriMaint stable,
remets-le sous surveillance FIM.

Dans `/root/vps-security-stack/docker-compose.yml`, ajouter aux services
`clamav` **et** `sec-agent` (au même chemin dans les deux) :

```yaml
      - trimaint_uploads_data:/scan/trimaint-uploads:ro
```

Et en bas du fichier :

```yaml
  trimaint_uploads_data:
    name: trimaint_uploads_data
    external: true
```

Dans `/root/vps-security-stack/agent/config.yml` :

```yaml
watch_paths:
  - path: /scan/trimaint-uploads
    label: "TriMaint - uploads"
    severity: high

full_scan:
  paths:
    - /scan/trimaint-uploads
```

Puis :
```bash
cd /root/vps-security-stack
docker compose up -d
docker logs sec-agent | grep "Surveillance active"
```

---

## Dette technique à traiter

Ces points ne bloquent pas ce déploiement mais poseront problème plus tard.

### 1. Le projet n'est pas déployable from scratch

**`backend/entrypoint.sh`** — le bloc « colonne rotation » (ligne ~64) s'exécute
avant `alembic upgrade head` (ligne ~79) et plante sur base vierge. Le déplacer
**après** les migrations, ou le rendre non bloquant avec `2>/dev/null || true`
comme le bloc juste au-dessus.

**`backend/alembic/versions/0011_taille_pastille_float.py`** — ✅ Fait. La
migration vérifie désormais en début de `upgrade()` si `machines.taille_pastille`
existe (via `information_schema.columns`) ; si la base est vierge, elle crée
directement `couleur` (String(7)) et `taille_pastille` (Float) avec
`op.add_column` puis retourne, sans passer par la conversion INTEGER→FLOAT
ci-dessous (celle-ci reste inchangée pour les bases déjà migrées).

Test de non-régression : `docker compose down -v && docker compose up -d` sur
une base vierge doit aboutir à une application fonctionnelle. Non exécuté de
bout en bout faute de Postgres disponible dans cette session — le correctif
0011 est vérifié par relecture de code, chargement du module Alembic et la
suite de tests existante, mais pas encore par un déploiement réel from
scratch.

### 2. Les migrations SQL manuelles à la racine

✅ Fait. `migration_v23.sql` à `migration_v28_*.sql` étaient des doublons
octet pour octet des fichiers déjà présents dans `migrations/` (à l'exception
de `migration_v23.sql`, qui créait `machines.couleur`/`machines.taille_pastille`
— rendu inutile par le correctif de la migration 0011 ci-dessus). Supprimés
de la racine.

### 3. `.env` versionné dans le repo public

Le fichier s'appelle `.env` et non `.env.example`. Il ne contient que des
placeholders aujourd'hui, mais sur un repo **public** c'est un accident qui
attend de se produire : un `git add .` un peu rapide depuis un poste de dev où
le fichier est rempli, et les secrets partent en ligne.

```bash
git mv .env .env.example
echo ".env" >> .gitignore
git commit -m "chore: .env -> .env.example pour éviter tout commit accidentel de secrets"
```

---

## Dépannage

**Le backend redémarre en boucle**
```bash
docker compose logs backend --tail 50
```
Si `relation "machines" does not exist` : la restauration du dump a échoué.
Consulter `/tmp/restore-trimaint.log` et relancer `prepare-trimaint.sh`.

**`host not found in upstream "backend"`**
Le frontend et le backend ne sont pas sur le même réseau. Vérifier que les
trois services sont bien dans `trimaint_net` — ne jamais déployer ces services
séparément (c'est ce qui avait cassé avec Git Deploy).

**Le domaine renvoie 404**
```bash
curl -sI http://127.0.0.1:7001     # le conteneur répond-il ?
ls /etc/nginx/sites-enabled/       # le vhost existe-t-il, bien orthographié ?
nginx -t && systemctl reload nginx
```

**Conflit de nom de conteneur au déploiement**
```bash
docker rm -f trimaint_db trimaint_backend trimaint_frontend
```
puis redéployer depuis DockPanel.
