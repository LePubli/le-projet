# TriMaint — déploiement sur DockPanel (Git Deploy)

Chaque service est déployé séparément depuis ce dépôt GitHub, avec mise à jour
automatique à chaque `git push` sur la branche `master`.

---

## Architecture

```
Internet
   │  https://triselec.le-publicitaire.fr                 https://api-triselec.le-publicitaire.fr
   ▼                                                                   ▲
nginx de l'hôte (DockPanel, TLS Let's Encrypt)                          │
   │                                                                   │
   ▼                                                                   │
trimaint-web   (Git Deploy, Build Context = frontend, port 80)         │
   sert la SPA React ; relaie /api/, /docs, /redoc ───────────────────┘
                                                      │
trimaint-api   (Git Deploy, Build Context = backend, port 8000)  ◄──────┘
   FastAPI + gunicorn ; migrations Alembic au démarrage ; sauvegarde nocturne
   │
   ▼
PostgreSQL 16 (conteneur `trimaint_db`, volume `trimaint_postgres_data`)
```

- **Frontend** : le modèle `frontend/nginx.conf.template` lit deux variables au
  démarrage du conteneur : `BACKEND_UPSTREAM` (adresse du backend) et
  `BACKEND_HOST_HEADER` (nom de domaine du backend, utilisé par le vhost nginx
  de l'hôte pour router la requête). Sans ces variables, l'image vise
  `http://backend:8000`, ce qui correspond au `docker-compose.yml`.
- **Backend** : aucune adaptation nécessaire. Au démarrage il attend la base,
  applique `alembic upgrade head`, puis lance gunicorn.
- **Base** : sur une base vierge, les 21 migrations (0001 → 0021) passent sans
  erreur (testé le 2026-10-14) ; sur la base de production, déjà en `0021`,
  `upgrade head` ne fait rien.

> Un Git Deploy **remplace le conteneur à chaque déploiement** : tout ce que
> l'application écrit sur son propre système de fichiers est perdu. Les
> fichiers téléversés (`/data/uploads`) et les sauvegardes (`/data/backups`)
> doivent donc être déclarés dans **Persistent Volumes**.

---

## Prérequis

- DockPanel, Docker, et ce dépôt accessible depuis le VPS (il est public).
- Un enregistrement DNS `A` pour le domaine du backend :
  `api-triselec.le-publicitaire.fr` → `82.22.77.159`.
- La base PostgreSQL de TriMaint (conteneur `trimaint_db`) toujours en marche et
  joignable depuis un conteneur Git Deploy (voir « Accès à la base »).
- Une sauvegarde fraîche de la base **avant** toute bascule.

---

## Déploiement

### 1. Backend — `trimaint-api`

**Git Deploy → New Deploy** (le conteneur s'appellera `dockpanel-git-trimaint-api`)

| Champ | Valeur |
|---|---|
| Name | `trimaint-api` |
| Repository URL | `https://github.com/LePubli/le-projet.git` |
| Branch | `master` |
| Dockerfile Path | `Dockerfile` |
| Build Context | `backend` |
| Container Port | `8000` |
| Domain | `api-triselec.le-publicitaire.fr` |
| Persistent Volumes | `/data/uploads` et `/data/backups` |
| Auto-deploy on push | coché (une fois la bascule validée) |

**Environment Variables** : « Paste .env », avec le contenu de `.env.example`
rempli (`SECRET_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS`, etc.). Les valeurs de
production se trouvent dans `/root/apps/trimaint-prod/.env` sur le VPS ; ne les
recopie jamais dans un message ou dans le dépôt.

### 2. Frontend — `trimaint-web`

| Champ | Valeur |
|---|---|
| Name | `trimaint-web` |
| Repository URL | `https://github.com/LePubli/le-projet.git` |
| Branch | `master` |
| Dockerfile Path | `Dockerfile` |
| Build Context | `frontend` |
| Container Port | `80` |
| Domain | `triselec.le-publicitaire.fr` |
| Persistent Volumes | aucun |
| Auto-deploy on push | coché (une fois la bascule validée) |

**Environment Variables** :

```
BACKEND_UPSTREAM=https://api-triselec.le-publicitaire.fr
BACKEND_HOST_HEADER=api-triselec.le-publicitaire.fr
```

Le navigateur continue de parler à une seule adresse (`triselec…`) : le CORS,
la politique CSP (`connect-src 'self'`) et les cookies restent inchangés.

### Accès à la base

Le backend (conteneur Git Deploy sur le réseau Docker par défaut) doit joindre
`trimaint_db`, qui vit sur le réseau `trimaint_net`. Une solution simple et
stable : publier le port de la base **uniquement** sur l'interface `docker0`
de l'hôte, en ajoutant au service `postgres` du compose :

```yaml
    ports:
      - "172.17.0.1:5433:5432"
```

`DATABASE_URL` devient alors
`postgresql://UTILISATEUR:MOT_DE_PASSE@172.17.0.1:5433/trimaint`.
Vérifier que `172.17.0.1` est bien l'adresse de `docker0`
(`ip -4 addr show docker0`), et que le pare-feu laisse passer les conteneurs
(`ufw allow from 172.16.0.0/12 to 172.17.0.1 port 5433 proto tcp`).
La base reste invisible depuis Internet.

### Fichiers téléversés existants

Les photos et médias déjà présents sont dans le volume Docker
`trimaint_uploads_data`. À copier dans le volume persistant du nouveau backend
(arrêter l'ancien backend avant, pour ne rien perdre) :

```bash
SRC=trimaint_uploads_data
DST=$(docker inspect dockpanel-git-trimaint-api --format '{{range .Mounts}}{{if eq .Destination "/data/uploads"}}{{.Source}}{{end}}{{end}}')
echo "Destination : $DST"
docker run --rm -v "$SRC":/src:ro -v "$DST":/dst alpine sh -c 'cp -a /src/. /dst/'
```

---

## Bascule depuis l'ancienne stack (docker-compose manuel)

À faire en dehors des heures de travail : compter 10 minutes d'interruption.

1. **Sans impact, ancienne stack toujours active.**
   - Créer l'enregistrement DNS `api-triselec…`.
   - Sauvegarder la base (`docker exec trimaint_db pg_dump -U trimaint -d trimaint | gzip > /root/trimaint-avant-bascule.sql.gz`).
   - Publier le port de la base sur `docker0` (voir « Accès à la base »), ce qui recrée seulement `trimaint_db`, volume intact.
   - Déployer `trimaint-api` et vérifier `https://api-triselec…/api/health`.
2. **Fenêtre de bascule.**
   - Arrêter l'ancien frontend et l'ancien backend : `docker stop trimaint_frontend trimaint_backend`.
   - Copier les fichiers téléversés (voir « Fichiers téléversés existants »).
   - Dans DockPanel, **Sites → triselec.le-publicitaire.fr → Delete** : le Git Deploy `trimaint-web` crée lui-même le vhost de ce domaine (un Site « Reverse Proxy » du même nom entrerait en conflit).
   - Déployer `trimaint-web`, puis exécuter les vérifications ci-dessous.
3. **Après une semaine sans incident.**
   - Supprimer l'ancienne stack (`docker compose down` dans `/root/apps/trimaint-prod`), les images `trimaint-*:prod`, `trimaint-*:latest` et `dockpanel-git-trimaint-backend/frontend`, puis le volume `trimaint_uploads_data` une fois sa copie contrôlée.
   - Changer le mot de passe PostgreSQL (`ALTER USER trimaint WITH PASSWORD '…';`) et le reporter dans `DATABASE_URL`.

---

## Vérifications

```bash
curl -s https://api-triselec.le-publicitaire.fr/api/health
curl -sI https://triselec.le-publicitaire.fr | head -1
docker logs --tail 30 dockpanel-git-trimaint-api        # « Migrations terminées. » puis gunicorn
docker exec trimaint_db psql -U trimaint -d trimaint -c "SELECT version_num FROM alembic_version;"   # 0021
```

Se connecter à l'application avec un compte existant, ouvrir une panne avec
photo : la photo doit s'afficher (le chemin `/api/uploads/…` est servi par le
backend, via le frontend).

---

## Mise à jour

Un `git push` sur `master` suffit si **Auto-deploy on push** est coché (webhook
GitHub). Sinon : **Git Deploy → Deploy** sur le service concerné.

Les migrations Alembic s'exécutent au démarrage du backend. Une migration
appliquée n'est jamais modifiée : on corrige en avant.

## Retour en arrière

Tant que l'ancienne stack (`/root/apps/trimaint-prod`) n'est pas supprimée :

1. arrêter ou supprimer les deux Git Deploy `trimaint-web` et `trimaint-api` ;
2. `cd /root/apps/trimaint-prod && docker compose up -d` ;
3. le domaine `triselec.le-publicitaire.fr` repointe sur `127.0.0.1:7001`.

Les volumes (`trimaint_postgres_data`, `trimaint_uploads_data`) ne sont jamais
touchés par la bascule.

---

## Sauvegardes

`BACKUP_ENABLED=1` : le backend dumpe la base chaque nuit à 2h dans le volume
`trimaint_backups_data`, avec 30 jours de rétention.

```bash
docker exec dockpanel-git-trimaint-api ls -lh /data/backups/
```

⚠️ Ces sauvegardes vivent **sur le même serveur** que la base. Une copie
chiffrée hors du VPS est faite chaque nuit par le script de sauvegarde du
serveur (dump de la base, et fichiers téléversés une fois le volume
`/data/uploads` repéré). Une sauvegarde locale seule ne protège ni d'une perte
de serveur ni d'une compromission.

---

## Réactiver la surveillance de sécurité

Le volume d'uploads est un emplacement sensible : c'est là qu'un fichier
malveillant serait déposé en cas de faille d'upload. Une fois TriMaint stable,
remets-le sous surveillance FIM.

Après la bascule en Git Deploy, le volume d'uploads est géré par DockPanel : remplacer
`trimaint_uploads_data` ci-dessous par le chemin ou le volume réel (voir
`docker inspect dockpanel-git-trimaint-api`).

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

## Dette technique

Historique des points relevés lors de la mise en place de ce déploiement.
Les 4 points ci-dessous sont résolus (dernier en date : 2026-09-12) ; la
section reste comme référence sur ce qui a été trouvé et corrigé.

### 1. Le projet n'est pas déployable from scratch — corrigé

**`backend/entrypoint.sh`** — ✅ Fait (2026-09-12). Le bloc « colonne rotation »
s'exécutait avant `alembic upgrade head` et plantait sur base vierge (aucune
migration ne crée jamais `machines.rotation` — le commentaire l'attribuant à
la migration 0008 était inexact : 0008 ne fait que seeder des équipements).
Vérification faite qu'aucune migration entre 0008 et head ne dépend de
l'existence de cette colonne. Plutôt que de déplacer le bloc ou de le rendre
non bloquant, la colonne est désormais créée par une vraie migration Alembic
idempotente (`backend/alembic/versions/0021_machine_rotation.py`, même
pattern que 0011/0017 : `information_schema.columns` puis `add_column` si
absente) et le bloc manuel a été supprimé d'`entrypoint.sh`.

**`backend/alembic/versions/0011_taille_pastille_float.py`** — ✅ Fait. La
migration vérifie désormais en début de `upgrade()` si `machines.taille_pastille`
existe (via `information_schema.columns`) ; si la base est vierge, elle crée
directement `couleur` (String(7)) et `taille_pastille` (Float) avec
`op.add_column` puis retourne, sans passer par la conversion INTEGER→FLOAT
ci-dessous (celle-ci reste inchangée pour les bases déjà migrées).

Test de non-régression : exécuté de bout en bout le 2026-09-12 sur un
conteneur Postgres jetable (pas besoin de la stack Docker complète, qui
référence des images `:prod` prégénérées) —
`alembic upgrade head` depuis une base vierge passe les 21 migrations sans
erreur et crée `rotation` ; `alembic downgrade -1` puis re-`upgrade head`
repasse proprement ; et le scénario prod (colonne `rotation` déjà présente
avant migration, ex. base restaurée depuis un dump) confirmé idempotent —
aucune tentative de recréer la colonne.

### 2. Les migrations SQL manuelles

✅ Fait. Les fichiers `migration_v23.sql` à `migration_v28_*.sql` doublonnaient
les migrations Alembic `0011` à `0015` ; le dossier `migrations/` a été supprimé
du dépôt (l'historique Git les conserve). Alembic est la seule source de vérité
du schéma.

### 3. `.env` versionné dans le repo public — résolu

Vérifié le 2026-09-12 : `.env` n'existe plus dans le repo (ni tracké, ni
présent sur disque), et `.gitignore` contient déjà la règle `.env`. Aucun
autre fichier `.env*` n'est présent dans `backend/` ou `frontend/`.

### 4. Contrôle d'accès insuffisant sur plusieurs endpoints — corrigé

Trouvé par une revue de sécurité sur le commit initial (2026-09-11), corrigé
et testé le 2026-09-12.

**Autorisation manquante** — `backend/app/api/bons_travail.py` : `add_gamme`,
`update_gamme`, `add_piece`, `add_compteur`, `update_compteur` n'exigeaient
qu'un utilisateur authentifié (`get_current_user`), sans vérification de
rôle. Incohérent avec `delete_gamme`/`delete_piece`, qui exigent
correctement `require_manager_or_admin`. Un compte `lecteur` (censé être
lecture seule) pouvait donc modifier gammes, pièces et compteurs.
→ Ces endpoints exigent désormais `require_edit_access` (bloque `lecteur`),
ainsi que `add_visa` (`bons_travail.py`) et `add_signature` (`extra.py`), qui
n'étaient pas listés dans le constat initial mais avaient la même faille.

**Champ `role` usurpable** — deux endroits où un champ `role` entièrement
contrôlé par le client est stocké comme attestation sans aucune validation
contre le rôle réel de l'utilisateur :
- `backend/app/api/bons_travail.py:add_visa` — `BTVisaCreate.role`
  (`"Intervenant"`, `"Responsable"`, `"Contrôle qualité"`)
- `backend/app/api/extra.py:add_signature` — `SignatureBody.role`
  (`"intervenant"|"responsable"|"controle"`)

N'importe quel utilisateur authentifié pouvait donc s'auto-attribuer un visa
ou une signature « Contrôle qualité » sur un Bon de Travail.
→ `require_signatory_role` (`backend/app/core/security.py`) valide désormais
le rôle déclaré contre le rôle système de l'utilisateur (mapping
`_SIGNATORY_ROLES`) et est appelée dans `add_visa` et `add_signature`.

**Constat plus large** — `require_edit_access` (`backend/app/core/security.py`),
censée bloquer les `lecteur` en écriture (docstring explicite), n'était
**utilisée nulle part** dans le code. Le rôle `lecteur` n'était donc pas
réellement lecture-seule sur l'API, quel que soit l'endpoint.
→ Désormais utilisée sur les 7 endpoints listés ci-dessus. Aucun autre
appelant de `get_current_user` dans `bons_travail.py`/`extra.py` n'a été
identifié comme nécessitant le même traitement (le reste sont des lectures
ou déjà protégés par `require_manager_or_admin`/`require_admin`).

Tests de non-régression : `backend/tests/test_bt_authorization.py`.

### 5. Rate-limiting du login jamais actif — corrigé

Trouvé le 2026-09-13 en investiguant une flakiness de test (non liée — voir
NOTES.md de session), corrigé le jour même.

`backend/app/main.py` définit `limiter = Limiter(...)` **après** avoir importé
les routers (`from app.api import auth, ...`), mais `backend/app/api/auth.py`
fait `from app.main import limiter` **à son propre import**. Au moment où
Python exécute cet import, `app.main` est en cours de chargement et n'a pas
encore défini `limiter` : l'import échouait systématiquement (import
circulaire), et le `except` de secours dans `auth.py` remplaçait le
rate-limit par une fonction identité. Résultat : la limite de 5 tentatives de
connexion par minute annoncée dans la docstring de l'endpoint `/api/auth/login`
n'a **jamais été appliquée, ni en test ni en production**. Vérifié par un
essai direct : 8 tentatives de connexion consécutives → 8× code 200, aucun 429.

→ `limiter` est désormais défini avant l'import des routers dans `main.py`,
et désactivé explicitement quand `TEST_MODE=1` (la suite de tests dépasse
largement 5 logins/minute cumulés) au lieu de dépendre d'un import cassé.
Le `try/except` dans `auth.py`, devenu sans objet, a été supprimé.

Vérifié : 8 tentatives consécutives → 5× 200 puis 429 sans `TEST_MODE` ;
8× 200 avec `TEST_MODE=1`.

---

Un modèle sans secret, `.env.example`, est maintenant versionné à la racine.

## Dépannage

**Le frontend ne démarre pas : `host not found in upstream`**
Le nom de `BACKEND_UPSTREAM` ne se résout pas depuis le conteneur. Vérifier
l'orthographe du domaine et l'enregistrement DNS (`dig +short api-triselec.le-publicitaire.fr`).
Le conteneur redémarre automatiquement et repart dès que le DNS répond.

**Erreur 404 ou mauvais site derrière `/api`**
`BACKEND_HOST_HEADER` doit être exactement le domaine du backend : c'est lui
qui fait choisir le bon vhost à nginx.

**Erreur 413 à l'envoi d'une photo ou d'une vidéo**
La limite d'envoi du vhost nginx du backend est trop basse (le backend accepte
60 Mo). Vérifier `client_max_body_size` dans le vhost `api-triselec…` de
`/etc/nginx/sites-enabled/`.

**Le backend redémarre en boucle**
```bash
docker logs --tail 50 dockpanel-git-trimaint-api
```
`DATABASE_URL non défini` ou `PostgreSQL non disponible` : vérifier la variable
et l'accès à la base (`docker exec dockpanel-git-trimaint-api python -c "import psycopg2,os; psycopg2.connect(os.environ['DATABASE_URL']); print('ok')"`).

**Les photos disparaissent après un déploiement**
Le chemin `/data/uploads` n'est pas déclaré dans **Persistent Volumes**.

**Le domaine renvoie 404**
```bash
ls /etc/nginx/sites-enabled/       # le vhost existe-t-il, bien orthographié ?
nginx -t && systemctl reload nginx
```
