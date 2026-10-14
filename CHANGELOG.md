# Changelog

Tous les changements notables du projet RefMaint/TriMaint sont documentés ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Modifié — déploiement Git Deploy DockPanel
- `frontend/nginx.conf` devient `frontend/nginx.conf.template` : l'adresse du
  backend et l'en-tête Host sont lus dans `BACKEND_UPSTREAM` et
  `BACKEND_HOST_HEADER` au démarrage du conteneur (défaut : `http://backend:8000`,
  comportement inchangé avec le docker-compose). Permet de déployer frontend et
  backend séparément.
- `docker-compose.yml` déplacé vers `local/docker-compose.yml` (ajout de `build:`
  pour le développement local) : à la racine, DockPanel Git Deploy le détectait et
  déployait une pile Compose avec son propre Postgres sur le volume de production
  au lieu de construire le Dockerfile du service. Le `Makefile` utilise
  `-f local/docker-compose.yml --project-directory .`.
- `backend/entrypoint.sh` : suppression du bloc de réparation d'anciens
  identifiants de révision Alembic (base de production en `0021`).

### Ajouté
- `.env.example` : modèle de configuration sans secret.

### Supprimé
- `migrations/` (SQL manuels doublonnant les migrations Alembic `0011` à `0015`).
- `prepare-trimaint.sh` (préparation manuelle de l'ancien déploiement).

## [2.0.0] - 2026-07-27

### Ajouté — Tier 3 complet (#13 à #19)

#### #13 Multi-sites
- `SiteContext` + `SiteProvider` : sélecteur de site global persisté en
  localStorage. L'intercepteur axios injecte automatiquement `?site=xxx`
  sur toutes les requêtes API (sauf auth/uploads).
- Endpoint `GET /api/machines/meta/sites` : liste les sites distincts.
- Sélecteur dropdown dans le header mobile (apparait si > 1 site).
- Layout mis à jour avec `useSite` hook + fetch au démarrage.

#### #15 Rôles plus fins
- Nouveaux rôles : `lecteur` (lecture seule — aucun POST/PUT/DELETE) et
  `chef_equipe` (peut valider interventions + accéder aux pages admin).
- `security.py` : `require_manager_or_admin` accepte désormais `chef_equipe`.
  Nouvelle dépendance `require_edit_access` qui bloque `lecteur`.
- Frontend : `canEdit` mis à jour dans PanneDetail, Pannes, Machines,
  BonsTravailList, CalendarMaintenance pour inclure `chef_equipe`.
- `roleLabels` et couleurs mis à jour dans Layout (teal pour chef_equipe).

#### #16 API publique avec token dédié
- Modèle `ApiToken` + migration `0016` (idempotente).
- Endpoints admin `/api/api-tokens/` : list, create (token auto-généré),
  delete, toggle active/inactive.
- Endpoints publics `/api/public/` : `GET /machines`, `GET /pannes`,
  `GET /kpi`, `GET /sites` — authentifiés via header `X-API-Token`
  (différent du JWT user). Idéal pour intégration ERP/supervision.
- `last_used` mis à jour à chaque appel pour tracking.

#### #17 Audit trail enrichi
- Colonne `changes` (JSON) ajoutée à `activity_logs` via migration `0016`.
- `activity.py` : nouvelle fonction `compute_diff(old, new)` qui calcule
  le diff champ par champ `{"field": {"before": ..., "after": ...}}`.
- `pannes.py` PUT : capture les anciennes valeurs, applique l'update,
  calcule le diff, et l'enregistre dans `log_activity(changes=diff)`.

#### #18 Heatmap pannes avec filtre temporel
- `kpi.py` `GET /heatmap` : nouveau paramètre `days` (0 = tout l'historique,
  30 = 30 derniers jours). Filtre les pannes par `created_at >= since`.
- Frontend `SchemaInteractif` : état `heatmapDays` (défaut 30). Sélecteur
  de période (7j / 30j / 90j / Tout) dans le menu overflow mobile.
- L'API call passe `?days=${heatmapDays}` automatiquement.

#### #19 Gantt des maintenances préventives
- `CalendarMaintenance.tsx` : nouveau mode `viewMode = 'gantt'` en plus
  de 'calendar' et 'liste'. 3 boutons toggle : Calendrier / Gantt / Liste.
- Vue Gantt : timeline horizontale sur 3 mois avec barres colorées par
  statut (bleu = à temps, orange = bientôt, rouge = en retard). Chaque
  barre affiche la date d'échéance. Légende en bas.
- Scroll horizontal sur mobile (min-w 800px).

## [1.9.0] - 2026-07-27

### Ajouté — Vague 2 (Tier 2 complet)

#### #11 Filtres sauvegardés
- **Backend** : modèle `SavedFilter` (table `saved_filters`) + migration Alembic
  `0014` + SQL `migration_v27_saved_filters.sql`. Endpoints CRUD sous
  `/api/saved-filters/` (list par entité, create, delete — filtré par user_id).
- **Frontend** : composant `SavedFiltersBar` réutilisable. Affiche les filtres
  sauvegardés sous forme de chips cliquables + bouton "Sauvegarder" qui
  apparaît quand des filtres sont actifs. Intégré dans `Pannes.tsx`
  (filtre search) et `BonsTravailList.tsx` (filtres search + statut).

#### #8 Notifications push web (Web Push API)
- **Backend** : `pywebpush` ajouté aux requirements. Modèle `PushSubscription`
  + migration Alembic `0015` + SQL `migration_v28_push_subscriptions.sql`.
  Endpoints `/api/push/` : `GET vapid-public-key`, `POST subscribe`,
  `POST unsubscribe`. Fonction `broadcast_push()` appelée automatiquement
  lors de la création d'une panne critique (criticite >= 4). Nettoyage
  automatique des endpoints invalides (410 Gone).
- **Configuration** : variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_CLAIM_EMAIL` dans l'env. Générer avec `npx web-push generate-vapid-keys`.
- **Frontend** : hook `useServiceWorker` qui gère l'abonnement push (demande
  permission, convertit VAPID key, envoie au backend). Bouton cloche
  (Bell/BellOff) dans le header mobile ET desktop sidebar. Push non bloquant
  — si pas de VAPID keys configurées, le bouton n'apparaît pas.

#### #12 Mode hors-ligne complet avec sync automatique
- **Service Worker** (`public/sw.js`) complet :
  - **Cache des assets statiques** : cache-first pour JS/CSS/images/fonts
  - **Cache API** : stale-while-revalidate pour les GET `/api/*` — les
    données sont servies depuis le cache immédiatement, puis mises à jour
    en arrière-plan
  - **Queue hors-ligne** : les POST/PUT/DELETE quand offline sont stockés
    dans IndexedDB (`trimaint-sync-db`) et rejoués via Background Sync API
  - **Push event handler** : affiche les notifications reçues du serveur
  - **Notification click** : focus la fenêtre existante ou ouvre l'URL
  - **Message channel** : communication bidirectionnelle avec le frontend
    (queue size, sync-complete event)
- **PWA** : `manifest.json` + `favicon.svg` + meta tags Apple. L'app est
  installable sur smartphone ("Ajouter à l'écran d'accueil").
- **Frontend** : hook `useServiceWorker` qui gère :
  - Détection online/offline (event listeners `online`/`offline`)
  - Indicateur visuel "Hors ligne" (badge rouge) dans le header
  - Indicateur de queue (badge ambre avec compteur + spinner si sync en cours)
  - Synchronisation automatique au retour du réseau (Background Sync ou
    fallback manuel)
  - Abonnement push (voir #8 ci-dessus)
- **Indicateurs visuels** (header mobile + sidebar desktop) :
  - 🔴 `Hors ligne` (WifiOff) quand pas de réseau
  - 🟡 `N` actions en attente (RefreshCcw spinner) quand queue > 0
  - 🔔 Bell/BellOff pour activer/désactiver les notifications push

## [1.8.0] - 2026-07-27

### Ajouté — Vague 1 (Tier 2)

#### #9 Recherche globale fuzzy (trigramme PostgreSQL)
- **Backend** `search.py` refondu : active automatiquement l'extension
  `pg_trgm` de PostgreSQL. Si disponible, utilise `similarity()` pour
  tolérer les fautes de frappe et les espaces manquants (ex: « l315 » → L315,
  « L 315 » → L315). Fallback `ILIKE` si l'extension n'est pas installable.
- Résultats triés par score de similarité (le plus pertinent en premier).
- **Nouvelles entités recherchées** : Bons de Travail (titre, description,
  numéro) et Base de connaissances (pannes avec solution). La recherche
  inclut maintenant 6 catégories : machines, lignes, pannes, BT,
  interventions, base de connaissances.
- **Frontend** `Recherche.tsx` refondu :
  - Surlignage des correspondances en orange dans tous les résultats
  - 6 sections au lieu de 3, avec icônes et compteurs
  - Navigation directe au clic (machine → fiche, panne → détail, BT → détail)
  - Hint « Tolérant aux fautes de frappe » sous l'input

#### #7 Dashboard superviseur enrichi avec graphiques
- **Backend** `kpi.py` : ajout de `criticite_distribution` (count par niveau
  1-5), `bt_statut_distribution` (count par statut BT), `total_pannes` et
  `total_machines` dans la réponse `/api/kpi/dashboard`.
- **Frontend** nouveau composant `Charts.tsx` avec graphiques SVG légers
  (sans dépendance externe — pas de recharts/chart.js) :
  - `BarChart` : barres verticales avec labels et valeurs
  - `DonutChart` : anneau SVG avec légende et pourcentages
  - `HBarChart` : barres horizontales avec labels et compteurs
- **DashboardSuperviseur.tsx** : ajout d'une nouvelle ligne (ROW 1.5) entre
  les KPI cards et les bar charts existants :
  - **Donut criticité** : distribution des pannes par niveau (1-5) avec
    couleurs graduées (bleu → vert → jaune → orange → rouge)
  - **Barres horizontales BT par statut** : à faire / en cours / terminé /
    clôturé avec totaux

## [1.7.0] - 2026-07-27

### Ajouté — Stabilité & confiance (Tier 1)

#### #1 Logs structurés JSON
- Nouveau module `app/core/logging.py` basé sur **structlog**.
  - `LOG_FORMAT=json` en production (pour ELK/Loki/Datadog)
  - `LOG_FORMAT=console` en dev (coloré, lisible)
- `RequestLoggingMiddleware` : log chaque requête HTTP (méthode, path,
  status, durée en ms). Le healthcheck est exclu pour éviter le spam.
- Logs structurés au démarrage (`app_starting`, `app_ready`, `app_stopping`)
  et création admin (`bootstrap_admin_created`).
- Endpoint `GET /api/health` enrichi : DB status, espace disque uploads,
  nombre de fichiers, CPU%, mémoire%, load average. Status `degraded` si
  DB down.

#### #2 Sauvegarde DB automatique
- Nouveau script `backend/backup_db.py` : `pg_dump` format custom compressé
  + rotation 30 jours par défaut.
- Logs structurés (`backup_starting`, `backup_completed`, `backup_rotated`).
- `entrypoint.sh` : si `BACKUP_ENABLED=1`, planifie un cron quotidien
  (`BACKUP_HOUR=02`, `BACKUP_MINUTE=00`) + sauvegarde initiale au démarrage.
- `Dockerfile` : ajout de `postgresql-client` (pg_dump) et `dcron`.
- `docker-compose.yml` : nouveau volume `backups_data` + variables
  `BACKUP_*` et `LOG_*` dans l'env du backend.

#### #5 Pagination universelle server-side
- `GET /api/pannes/` accepte désormais `page` + `page_size` (en plus de
  `skip`/`limit` legacy). Quand `page` est fourni, retourne
  `{items, total, page, page_size, total_pages}`. Cap à 200 par page.
- Rétro-compatible : sans `page`, retourne toujours une liste plate.

### Constaté — Dashboard superviseur (#7) déjà en place
- L'endpoint `GET /api/kpi/dashboard` existe déjà avec MTBF, MTTR, taux de
  disponibilité, top 5 machines à pannes, tendance mensuelle 12 mois,
  interventions par technicien, pièces les plus utilisées.
- La page `DashboardSuperviseur.tsx` consomme déjà tous ces KPIs.
- Rendue accessible via le menu desktop depuis le fix v1.5.4.

#### #10 Export PDF enrichi
- `RapportPanne.tsx` : ajout des **médias** (photos + vidéos) dans la
  section Diagnostic du PDF. Les images sont intégrées en grille dans le
  document imprimable ; les vidéos affichent un placeholder 🎬 avec le nom.
- Le rapport existait déjà avec en-tête entreprise, logo, signatures
  (Technicien / Responsable / Chef de site), protocole, interventions,
  pièces — il manquait juste les médias.

## [1.6.0] - 2026-07-27

### Corrigé (Critique — Médias 404)
- **Cause racine enfin trouvée** : le `location ~* \.(js|css|png|jpg|...)$` du
  `nginx.conf` capturait **toutes** les URLs se terminant par `.jpg` (y compris
  `/api/uploads/xxx.jpg`) **avant** le `location /api/` (les regex ont priorité
  sur les prefix locations). nginx servait donc le fichier depuis
  `/usr/share/nginx/html/api/uploads/xxx.jpg` → **404 Not Found**.
- **Fix** : la regex des static assets utilise maintenant un negative lookahead
  `^(?!/api/).*\.(js|css|png|jpg|...)$` pour exclure `/api/`. Ajout aussi de
  `mp4|webm|mov|webp` à la liste des extensions cachées. Les requêtes vers
  `/api/uploads/xxx.jpg` passent maintenant bien au backend FastAPI.

### Ajouté — Import / Export CSV pour toutes les entités
- **Nouveau module backend** `app/api/import_export.py` avec 4 endpoints par
  entité :
  - `GET  /api/import-export/{entity}/template` → CSV exemple (avec 2 lignes
    réalistes + commentaires décrivant chaque colonne)
  - `GET  /api/import-export/{entity}/export` → export de toutes les données
  - `POST /api/import-export/{entity}/validate` → dry-run, retourne erreurs
    + aperçu des 5 premières lignes mappées
  - `POST /api/import-export/{entity}/import` → import définitif (les lignes
    en erreur sont ignorées, pas de rollback global)
- **Entités supportées** : `machines`, `pannes`, `lignes`, `bons-travail`,
  `entretien`, `nettoyage`. Pour `pannes`/`bons-travail`/`entretien`/
  `nettoyage`, la colonne `machine_code` est résolue en `machine_id` par
  lookup sur `code_interne` (validation à l'import).
- **Format CSV** : séparateur `;`, encodage UTF-8 avec BOM (Excel FR friendly),
  lignes de commentaire commençant par `#` ignorées.
- **Nouveau composant frontend** `ImportExportDialog.tsx` réutilisable :
  - 2 boutons rapides : "Télécharger le template" + "Exporter les données"
  - Zone upload fichier + bouton "Valider (dry-run)"
  - Affichage des erreurs (ligne + colonne + message) + aperçu des 5
    premières lignes mappées
  - Bouton "Importer X ligne(s) en base" qui n'apparaît que si la validation
    passe
  - Résultat d'import : X importé(s), Y ignoré(s), erreurs détaillées
  - Workflow guidé affiché quand aucun fichier n'est sélectionné
- **Intégré** dans : `Machines.tsx`, `Pannes.tsx`, `Lignes.tsx`,
  `BonsTravailList.tsx` (couvre Entretien + Nettoyage via le composant
  partagé). L'ancien bouton "Export CSV" de `Pannes.tsx` est remplacé par le
  dialog complet.

## [1.5.4] - 2026-07-27

### Corrigé
- **Menu desktop incomplet** : le menu latéral desktop (`navItems`) ne contenait
  pas 3 liens présents dans le menu mobile "Plus" :
  - `/dashboard-superviseur` (Dashboard Superviseur)
  - `/quick-panne` (Signaler Panne)
  - `/maintenance-preventive/calendar` (Calendrier)
  Ajoutés au menu desktop pour cohérence.

### Amélioré — Diagnostic des médias cassés
- **Placeholder "Image indisponible"** : `MediaUploader` ajoute maintenant un
  `onError` sur les `<img>` et `<video>`. Si une image ne se charge pas
  (401/404/CORS), un placeholder texte "Image indisponible" s'affiche à la
  place de la miniature vide. Cela permet de distinguer :
  - "Aucun média" (liste vide — pas de médias attachés)
  - "Image indisponible" (média attaché mais ne se charge pas — problème
    serveur ou URL cassée)
  Si vous voyez "Image indisponible", c'est que le backend n'a pas été
  redéployé avec le fix v1.5.3 (GET `/api/uploads/{filename}` public) OU
  qu'il y a un cache navigateur. Faites Ctrl+Shift+R et si le problème
  persiste, vérifiez que le conteneur backend a bien été rebuilt.

## [1.5.3] - 2026-07-27

### Corrigé (Critique — Médias ne s'affichent pas)
- **Images et vidéos uploadées invisibles** : l'endpoint
  `GET /api/uploads/{filename}` exigeait `Depends(get_current_user)` (JWT).
  Or les balises `<img src="/api/uploads/xxx.jpg">` et `<video src="...">`
  du navigateur ne joignent **pas** le header `Authorization` automatiquement
  → 401 → images cassées (miniatures vides ou icône image brisée).
- **Fix** : l'endpoint GET est désormais **public**. La sécurité reste
  assurée par :
  - Les fichiers sont stockés sous des **UUID aléatoires** (non-énumérables).
  - Validation stricte contre le **path traversal** (`os.path.basename` +
    `realpath` check + `safe_dir` prefix check).
  - Protection optionnelle contre le **hot-linking** externe via
    `Referer`/`Origin` check (désactivable avec `UPLOAD_ALLOW_HOTLINK=1`).
  - L'**upload (POST) reste protégé par JWT** — seul un utilisateur
    authentifié peut uploader.
- L'ancien endpoint exigeait aussi `Depends(get_current_user)` qui pointait
  vers un placeholder `_` — la signature est maintenant `(filename, request)`
  avec `Request` pour accéder aux headers.

## [1.5.2] - 2026-07-27

### Ajouté — Recherche + localisation automatique sur le schéma
- **Zoom automatique sur la machine recherchée** : nouvelle fonction
  `zoomToMachine(machineId)` qui calcule la position de la pastille en
  pixels (via `imgNatural.w/h` + `toPctX/toPctY`), centre la machine dans
  le viewport, et zoome à ~3x avec transition fluide. L'utilisateur n'a
  plus à chercher visuellement la pulsation sur le schéma entier.
- **Déclencheurs** :
  - Touche **Entrée** dans la barre de recherche → zoom sur la 1ʳᵉ correspondance.
  - Nouveau **bouton cible** (icône `Crosshair`) à droite de l'input, qui
    apparaît dès qu'il y a une correspondance. Clic = zoom.
  - Hint textuel sous l'input : "« L315 » trouvé — appuyez sur Entrée ou
    cliquez la cible pour zoomer".
- **Recherche plus tolérante** : `searchMatch` ne fait plus qu'une
  correspondance exacte — il essaie maintenant dans l'ordre :
  1. égalité exacte (insensible à la casse),
  2. "commence par" (ex: "L31" → L310, L311, L315…),
  3. "contient".

### Amélioré — Highlight de recherche beaucoup plus visible
- Remplacement du simple `animate-ping` (faible halo jaune) par un
  **anneau délimitant pulsé** de 90px + un **disque glow** derrière le
  label. Animations CSS dédiées `trimaint-search-pulse` (scale 1→1.35,
  opacity 1→0.55) et `trimaint-search-glow` (scale 1→1.5, opacity 0.6→0.95)
  réglées sur 1.2s ease-in-out infini. La zone de la correspondance est
  maintenant **clairement délimitée** même avant de zoomer.

## [1.5.1] - 2026-07-27

### Corrigé
- **Champs média manquants dans le formulaire "Nouvelle panne"** (`Pannes.tsx`) :
  le formulaire de création/édition de panne n'avait pas les sections médias
  — seuls `QuickPanne` (signalement rapide) et `PanneDetail` (mode édition
  diagnostic) en avaient. Ajout des composants `MediaUploader` pour la cause
  et la solution dans le modal, avec persistance via `cause_medias` /
  `solution_medias` sur `POST /pannes/` et `PUT /pannes/{id}`.
- **Image `process2.jpg` floue au zoom** : l'image était rendue à `width: 100vw`
  (résolution CSS viewport), puis le `transform: scale()` du zoom l'agrandissait
  → flou dès zoom > 100%. L'image est désormais rendue à sa **largeur native**
  (3307px) via `imgNatural.w`, et le zoom initial est calculé pour fit-to-
  viewport. Les pixels source complets restent disponibles pour un zoom net
  jusqu'à 800%. `fitAll()` recalcule aussi le zoom de fit en fonction de la
  taille native.
- **Formulaires non-scrollables sur mobile** : plusieurs pages utilisaient
  `h-dvh` ou `h-full` qui verrouillaient la hauteur à l'intérieur du `main`
  du Layout (lui-même `overflow-auto`), empêchant le scroll quand le contenu
  débordait. Corrections :
  - `QuickPanne.tsx` : `h-dvh` → `min-h-dvh` (la page peut dépasser la viewport).
  - `PanneDetail.tsx`, `MachineDetail.tsx` : loading spinner `h-full` →
    `min-h-[60vh]` (le `h-full` ne marche pas dans un flex sans parent height).
  - `PanneDetail.tsx`, `Pannes.tsx`, `BonTravailForm.tsx`, `BaseConnaissances.tsx`,
    `MachineDetail.tsx` : padding `p-6` → `p-3 sm:p-6` et ajout de `pb-24 sm:pb-6`
    pour laisser de la place sous la bottom nav mobile.
  - `Pannes.tsx` (modal nouvelle panne) et `BaseConnaissances.tsx` (modal
    connaissance) : restructurés en **header sticky / body scrollable / footer
    sticky** avec `flex flex-col max-h-[95vh]`. Sur mobile, le modal devient
    un **bottom sheet** (`items-end sm:items-center`, `rounded-t-2xl`) qui
    occupe toute la largeur et se scroll indépendamment.

## [1.5.0] - 2026-07-27

### Ajouté — Médias étendus à Pannes (signalement) et Bons de Travail
- **QuickPanne** (signalement rapide) : remplacement de l'ancien système
  "photo unique" par le composant `MediaUploader` (photos + vidéos multiples).
  Les médias sont attachés comme `cause_medias` de la panne créée.
- **BonTravailForm** (création BT) : ajout de deux sections médias
  "Observations / état initial (avant travaux)" et "Résultat / état final
  (après travaux)" via le composant `MediaUploader`.
- **BonTravailDetail** (vue détail BT) : affichage des médias dans une section
  dédiée après le compte rendu, avec lightbox pour agrandir.
- **Backend** : `BonTravail` étendu avec `cause_medias` et `solution_medias`
  (JSON). Migration Alembic `0013_bt_medias.py` + SQL
  `migration_v26_bt_medias.sql`. Schémas `BonTravailCreate`, `BonTravailUpdate`,
  `BonTravailOut` mis à jour. L'endpoint `POST /api/bons-travail/` persiste
  désormais les médias.

### Corrigé — Médias visibles pour tous les utilisateurs
- **PanneDetail** : en mode lecture, si aucun média n'était attaché ET que
  l'utilisateur n'était pas admin/manager (`canEdit = false`), la section
  disparaissait complètement — donnant l'impression que la fonctionnalité
  n'existait pas. Désormais, un discret "Aucun média" s'affiche pour les
  techniciens, et le placeholder "Cliquer pour ajouter" reste pour les
  éditeurs. Les médias sont visibles **partout** (PC, tablette, mobile
  portrait et landscape).

## [1.4.2] - 2026-07-26

### Corrigé (Médias invisibles sur PC / mobile landscape)
- **Médias invisibles en mode lecture sans média** : dans `PanneDetail`,
  la section Diagnostic n'affichait les médias que s'il y en avait déjà.
  En lecture, un utilisateur ne voyant aucun média ne savait pas qu'il
  pouvait en ajouter. Ajout d'un composant `MediaSection` qui affiche un
  placeholder "Aucun média — cliquer pour ajouter" (bouton bordé en
  pointillé) pour les éditeurs, même quand la liste est vide. Le clic
  bascule en mode édition où le `MediaUploader` apparaît avec le bouton
  d'upload. Cela rend la fonctionnalité **découvrable sur toutes les
  tailles d'écran** (PC, tablette, mobile portrait et landscape).

### Amélioré (Navigation repliable sur toutes les tailles d'écran)
- **Seuil mobile relevé de 768 → 1024 px** dans `Layout.tsx` et
  `SchemaInteractif.tsx`. Les téléphones en mode landscape (généralement
  800-915px de large) basculaient avant en layout desktop, perdant la
  bottom nav repliable. Désormais ils restent en layout mobile.
- **Sidebar desktop repliable** : ajout d'un bouton toggle (chevron)
  dans l'en-tête de la sidebar qui replie la barre de 256px (`w-64`) à
  64px (`w-16`, rail icônes-only). Les labels sont masqués, les
  `title`/tooltips apparaissent au survol. Préférence persistée dans
  `localStorage` (`trimaint_sidebar_collapsed`). La notification bell
  et le bloc utilisateur s'adaptent au mode replié.

## [1.4.1] - 2026-07-26

### Corrigé (Critique — boucle de redémarrage)
- **Boucle de redémarrage du conteneur backend** : la migration Alembic
  `0012_panne_medias` référençait `down_revision = "0011_taille_pastille_float"`
  alors que la révision réellement déclarée dans `0011_taille_pastille_float.py`
  est `"0011"` (convention courte héritée de `0001`–`0005`). Alembic levait
  `KeyError: '0011_taille_pastille_float'` à chaque démarrage, empêchant
  l'entrypoint `alembic upgrade head` de terminer → restart en boucle.
  Correction : `down_revision = "0011"` (cohérent avec la chaîne
  `0001 → ... → 0010_bons_travail → 0011 → 0012`).
- **entrypoint.sh durci** : le garde-fou qui patchait déjà
  `alembic_version = '0006'` → `'0006_constraints_cascade'` est étendu pour
  aussi convertir `'0011_taille_pastille_float'` → `'0011'` et
  `'0012_panne_medias'` → `'0012'`. Permet de récupérer un DB déjà polluée
  par un déploiement antérieur cassé.

### Corrigé (CI GitHub Actions)
- **`Layout.tsx`** : import `ChevronDown` supprimé (inutilisé). Bloc
  `useEffect` vide supprimé (eslint `no-empty-pattern`). Apostrophe
  `"Journal d'activité"` échappée en `&apos;` (`react/no-unescaped-entities`).
  Commentaire ajouté dans le `catch {}` vide du toggle nav.
- **`MediaUploader.tsx`** : `err: any` → `err: unknown` avec assertion de
  type propre (`@typescript-eslint/no-explicit-any`).

## [1.4.0] - 2026-07-24

### Ajouté
- **Médias (photos + vidéos) sur les causes et solutions des pannes** :
  - Nouvelles colonnes `pannes.cause_medias` et `pannes.solution_medias`
    (JSON arrays). Migration Alembic `0012_panne_medias.py` + SQL
    `migration_v25_panne_medias.sql`.
  - Backend : `uploads.py` accepte désormais MP4, WEBM, MOV en plus des
    images. Validation magic bytes pour chaque format. Réponse enrichie
    avec `{filename, url, kind, name}` (`kind` = "image" ou "video").
  - Backend : `MAX_UPLOAD_SIZE` passe de 10 Mo à 50 Mo pour permettre les
    courtes vidéos de diagnostic. `nginx.conf` `client_max_body_size` passé
    de 12 Mo à 60 Mo. CSP mise à jour pour autoriser `media-src 'self' blob:`.
  - Frontend : nouveau composant `MediaUploader` réutilisable
    (`src/components/MediaUploader.tsx`) avec :
    - Upload multiple (FormData multipart), validation client (type + taille),
    - Grille de miniatures avec badge type (image/vidéo),
    - Bouton supprimer au survol,
    - **Lightbox plein écran** (clic pour agrandir, Echap pour fermer,
      autoplay pour les vidéos, contrôles natifs).
  - Intégré dans `PanneDetail.tsx` (section Diagnostic, mode édition et
    lecture) : médias attachés séparément à la cause réelle et à la solution.
  - Intégré dans `BaseConnaissances.tsx` (modal création/édition + affichage
    dans la carte dépliée).

### Amélioré (UX mobile — Navigation repliable)
- **Barre de navigation du bas repliable** sur mobile : un bouton
  `ChevronUp` dans le header permet de masquer/afficher la bottom nav.
  Préférence persistée dans `localStorage` (`trimaint_nav_collapsed`).
  Quand repliée, un bouton flottant "Menu" apparaît en bas centré pour
  la réafficher.
- Le bouton de bascule est aussi accessible depuis le drawer "Plus"
  (badge "Nav ON" / "Nav OFF").
- `SchemaInteractif.tsx` adapte dynamiquement la hauteur du canvas selon
  l'état replié de la nav (polling localStorage toutes 400 ms).
- Le `main` gagne ~64px verticaux quand la nav est repliée.

## [1.3.4] - 2026-07-24

### Corrigé (Critique)
- **Rotation des étiquettes invisible à l'écran** : le `<span>` contenant le
  label n'avait pas de `display: inline-block`. Or, **les transformations CSS
  (`transform: rotate(...)`) sont ignorées sur les éléments `inline`** (le
  display par défaut de `<span>`). La rotation était bien enregistrée en DB
  mais ne s'appliquait visuellement jamais. Ajout de `display: 'inline-block'`
  au span du label (rendu) ET à la preview live dans le modal d'édition.

### Amélioré (UX mobile — Schéma Interactif)
- **Top bar trop chargée sur smartphone** : 9 boutons s'entassaient sur 360px
  de large. Sur mobile, les actions secondaires (heatmap, multi-select,
  fit-all, reset zoom) sont désormais regroupées dans un menu **"..." → bottom
  sheet**. La barre ne contient plus que l'essentiel : retour, titre, édition
  (si manager), recherche, filtres, zoom +/-, "...".
- **Barre de recherche qui s'efface** : la barre est désormais `sticky top-0`
  sur mobile avec une ombre, et un bouton "X" pour la fermer explicitement.
  Input en `text-base` (16px) pour éviter le zoom auto iOS et faciliter la
  frappe au doigt.
- **Modal édition/création laborieux** :
  - Plein écran sur mobile (`h-[100dvh]`) au lieu d'un petit modal centré.
  - Tous les inputs/selects/textearea passent de `text-sm py-2` à
    `text-base py-3` sur mobile (taille tactile recommandée ≥44px).
  - Presets couleur agrandis de `w-5 h-5` (20px) à `w-8 h-8` (32px) sur
    mobile.
  - Presets de taille (0.5, 0.7, 0.9...) agrandis et wrappent sur plusieurs
    lignes si besoin.
  - Curseur de rotation plus épais (`h-2`) et champ numérique en `text-base`.
  - Boutons d'action (Annuler / Enregistrer / Supprimer) en **sticky bottom**
    sur mobile — toujours accessibles même avec le clavier ouvert.
- **Hauteur du canvas** : la racine du schéma utilisait `h-dvh` ce qui la
  faisait passer **derrière** la bottom nav du Layout. Corrigé en
  `h-[calc(100dvh-3.5rem-4rem)]` sur mobile (soustrait header 56px + nav 64px).
- **Barre multi-select mal positionnée** : `marginBottom: 40` → `bottom: '4rem'`
  pour se caler au-dessus de la bottom nav.
- **Légende mobile repliable** : la barre de légende (Convoyeur, Broyeur…)
  prenait 32px verticaux en permanence. Désormais repliée par défaut, avec
  un bouton "Légende (afficher)" pour l'étendre.

## [1.3.3] - 2026-07-24

### Corrigé
- **Rotation des étiquettes non persistante** : la rotation était stockée
  **uniquement dans `localStorage`** du navigateur (clé
  `trimaint_label_rotations`) et n'était jamais envoyée au backend, bien que
  la colonne `machines.rotation` existe. Conséquence : la rotation ne marchait
  que sur le navigateur qui l'avait saisie, était invisible pour les autres
  utilisateurs, et était perdue en navigation privée / autre appareil / cache
  vidé. L'endpoint `GET /api/machines/schema-data` ne renvoyait d'ailleurs pas
  le champ `rotation`. Corrections :
  - Backend : `schema-data` renvoie désormais `rotation` pour chaque machine.
  - Frontend : ajout de `rotation?` à l'interface `SchemaMachine` et au type
    global `Machine` (`frontend/src/types/index.ts`).
  - Frontend (`SchemaInteractif.tsx`) : suppression de `rotationMap` / de
    `saveRotation` / de l'init depuis `localStorage`. La rotation est lue
    directement depuis l'objet machine (`m.rotation ?? 0`) dans le rendu et
    dans `openEditModal`.
  - Frontend : la rotation est envoyée au backend dans les payloads de
    `POST /api/machines/` (création) et `PUT /api/machines/{id}` (édition).
  - Migration un-shot fournie : `scripts/migrate_label_rotations_to_db.js`
    (à coller dans la console du navigateur) pousse les rotations
    pré-existantes du `localStorage` vers la DB.

## [1.3.2] - 2026-07-24

### Corrigé
- **Pastilles créées invisibles sur le schéma** : `handleCreateMachine`
  (`frontend/src/pages/SchemaInteractif.tsx`) ne rappelait pas `fetchData()`
  après `POST /api/machines/`. La machine était bien créée en DB (visible dans
  la liste `/machines`) mais l'état local `data.machines` du composant schéma
  n'était jamais rafraîchi — la pastille n'apparaissait qu'après F5.
  Ajout de `fetchData()` + reset du formulaire après création.

### Changement
- **Remplacement de l'image de fond du schéma** : `public/process2.jpg`
  remplacé par un scan A3 paysage issu du PDF fourni par l'utilisateur
  (`Scan_Copieur_Lil_20260719101529.pdf`). Conversion via
  `scripts/convert_schema_pdf.py` (pdftoppm @ 200 DPI → Pillow → JPEG q85).
  Résolution finale : 3307×2338 (vs 4000×2400 précédemment). Le ratio √2 A3
  paysage correspond au ratio du système de coordonnées MAP (152/107 ≈ 1.42),
  les pastilles existantes restent donc positionnées correctement.

## [1.3.1] - 2026-07-24

### Corrigé
- **500 sur `GET /api/bons-travail/?type_bt=nettoyage`** : le modèle `BonTravail`
  ne déclarait pas les relations `machine`, `demandeur`, `intervenant`, alors que
  `list_bons_travail` les utilise via `joinedload()` et que `_bt_to_list_item`
  y accède (`bt.demandeur.username`, `bt.machine.nom`, …). Ajout des trois
  relations avec `lazy="joined"` et `foreign_keys=[...]` (nécessaire car deux
  FK pointent vers `users`).
- **422 sur `POST /api/machines/`** : le frontend `SchemaInteractif.tsx` envoie
  `taille_pastille` en em brut (float, ex. 0.9, 1.4) mais le schéma Pydantic
  `MachineCreate` le déclarait en `Optional[int]`. En mode lax de Pydantic v2,
  les floats à virgule sont rejetés sur un champ `int` → 422. Le champ passe à
  `Optional[float]` côté schéma ET modèle.
- **Frontend** : suppression du champ `type` (non présent dans `MachineCreate`)
  du payload envoyé par `handleCreateMachine` (POST `/machines/`).
- **Migration** : `migration_v24_taille_pastille_float.sql` + Alembic
  `0011_taille_pastille_float.py` convertissent la colonne `INTEGER` en
  `DOUBLE PRECISION` et divisent par 10 les anciennes valeurs `em*10` (entiers
  dans [1, 19]) pour préserver l'affichage existant.

## [1.1.0] - 2026-07-13

### Sécurité (Critique)
- **SECRET_KEY fail-fast** : l'application refuse de démarrer si `SECRET_KEY` n'est pas définie (suppression du default hardcodé)
- **Suppression de l'auto-création admin/admin123** : remplacée par un flag optionnel `BOOTSTRAP_ADMIN=1` avec mot de passe configurable
- **CORS restrictif** : `allow_origins=["*"]` remplacé par une liste explicite via `ALLOWED_ORIGINS` (env var)
- **Migration python-jose → PyJWT** : élimination des CVE-2024-33664 et CVE-2024-33663
- **Rate limiting sur /api/auth/login** : 5 tentatives/minute/IP via slowapi
- **Authorisations corrigées** : `require_manager_or_admin` sur tous les DELETE/PUT destructeurs (pannes, interventions, pieces, maintenance_preventive)
- **Upload magic bytes verification** : validation du contenu des fichiers et non plus seulement de l'extension
- **Validation PanneCreate.criticite** : contrainte `Field(ge=1, le=5)` au niveau Pydantic
- **Validation UserCreate.password** : longueur 8-72 caractères
- **Validation UserCreate.email** : utilisation de `EmailStr` (au lieu de `str`)
- **Suppression des identifiants par défaut** dans Login.tsx, README.md et replit.md

### Base de données
- **Migration 0006** : contraintes CHECK (`criticite` 1-5, `role` enum), CASCADE sur FK, PRIMARY KEY composite `pannes_pieces`, index de performance
- **Alembic env.py corrigé** : import des 8 modèles (au lieu de 5) pour autogenerate complet
- **Ajout `users.updated_at`** pour cohérence avec les autres modèles

### Infrastructure
- **docker-compose.yml** : ports publiés (8080:80), healthchecks sur les 3 services, restart policy, log rotation
- **docker-compose.yml** : variables obligatoires avec fail-fast (`${VAR:?message}`)
- **docker-compose.yml** : suppression `version: "3.9"` déprécié
- **Backend Dockerfile** : ajout curl pour healthcheck, HEALTHCHECK directive
- **Backend entrypoint** : Gunicorn avec 2 workers UvicornWorker (au lieu d'1 worker uvicorn brut)
- **nginx** : ajout CSP, HSTS, Referrer-Policy, Permissions-Policy headers
- **nginx** : cache static assets 30 jours, client_max_body_size 12m

### Frontend
- **Code splitting** : `React.lazy` + `Suspense` sur toutes les routes (bundle 390KB → 265KB initial, -32%)
- **Suppression @tanstack/react-query** : dépendance morte (jamais utilisée)
- **Interfaces TypeScript** : création de `src/types/index.ts` avec tous les types métier
- **ESLint 9 + Prettier** configurés (eslint.config.js, .prettierrc)
- **Vitest** configuré + 5 tests sur la page Login
- **Favicon SVG inline** (suppression référence /vite.svg manquante)
- **Login.tsx** : `autoComplete` sur les inputs, gestion d'erreur typée

### Backend
- **Lifespan FastAPI** : remplacement de `@app.on_event("startup")` déprécié
- **Pydantic v2** : `Field()` avec contraintes sur tous les champs sensibles
- **JWT** : ajout des claims `iat` et `nbf`, utilisation de `datetime.now(timezone.utc)`
- **bcrypt** : cost 12, vérification longueur 72 bytes avant hash
- **Upload path traversal** : protection renforcée avec `os.path.basename()` + `realpath` check
- **CSV export** : sécurité contre path traversal conservée
- **Logging** : log_activity sur login (audit trail)

### Tests & CI/CD
- **Tests backend** : 23 tests pytest (auth, pannes, pieces, autorisations, validation)
- **Tests frontend** : 5 tests vitest sur Login
- **CI GitHub Actions** : pipeline backend (lint, security, tests, coverage) + frontend (type-check, lint, build, tests)
- **Linters** : flake8 + black + isort + mypy (backend), ESLint + Prettier (frontend)

### Nettoyage
- **Suppression fichiers Replit** : `.replit`, `start.sh`, `deploy.sh`, `replit.md`, `main.py` vestigial, `uv.lock`, `pyproject.toml` racine
- **Suppression `attached_assets/`** (72 Mo de photos + logs debug)
- **Suppression `.agents/memory/`** (mémoire interne agent IA)
- **Suppression dead deps** : `passlib[bcrypt]`, `pillow` (jamais importés)
- **pyproject.toml backend** : ajout config black/isort/mypy/pytest
- **.gitignore** : ajout `attached_assets/`, `.env`, `coverage/`, etc.

### Documentation
- **README.md** réécrit : Docker uniquement, plus d'identifiants par défaut, instructions bootstrap admin, commandes Makefile, sauvegarde/restauration

## [1.0.0] - 2026-07-08

Version initiale (pré-audit).
- Application GMAO fonctionnelle avec FastAPI + React + PostgreSQL
- 5 migrations Alembic
- 50 endpoints API, 15 routes frontend
- Problèmes de sécurité critiques (voir rapport d'audit)
