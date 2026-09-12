# CLAUDE.md

## Le projet en trois lignes

TriMaint : GMAO pour Triselec (FastAPI+Postgres / React-Vite-TS, Docker sur
VPS DockPanel), utilisée à parts égales par techniciens terrain et
encadrement. Priorité actuelle : réduire complexité et duplication
(fichiers de 500 à 1400 lignes) en vue de features déjà prévues.

## Commandes

| Action | Commande |
|---|---|
| Backend dev | `docker compose up -d` puis `make migrate` |
| Backend test | `cd backend && pytest -v` |
| Backend lint | `cd backend && flake8 app tests && black --check app tests` (mypy hors gate, volontaire) |
| Frontend dev | `cd frontend && npm run dev` |
| Frontend build | `cd frontend && npm run build` |
| Frontend test | `cd frontend && npm test` |
| Frontend lint | `cd frontend && npm run lint` |

## Architecture

- Backend api/→models/→schemas/, **sans couche service** : logique métier
  dans `api/*.py` (jusqu'à 524 lignes). Refactor : couche service
  introduite progressivement, module par module.
- Frontend : `pages/` (28) + `components/` (9) + `services/api.ts` unique
  (axios, pas de TanStack Query). `SiteContext` (multi-site) injecte
  `?site=xxx` via intercepteur.
- La prod restaure un dump SQL plutôt que de rejouer les migrations. Les deux
  bugs qui bloquaient un replay complet (colonnes `couleur`/`taille_pastille`,
  colonne `rotation`) sont corrigés et testés depuis le 2026-09-12 (voir
  README « Dette technique ») ; le choix opérationnel de restaurer un dump
  n'a pas été changé pour autant — à réévaluer séparément si besoin. Migration
  Alembic appliquée = jamais modifiée, on corrige en avant.
- `docker-compose.yml` = variante DockPanel (pas de `build:`, port local,
  volumes nommés) ; écarts documentés en en-tête.

**Conventions** : français partout — code, commentaires, commits, termes
métier (`panne`, `bon_travail`, `chef_equipe`...).

## Zones interdites

- `frontend/src/pages/SchemaInteractif.tsx` (1439 lignes, carte
  interactive des machines) : jamais de refactor sans validation
  explicite au cas par cas, même si sa complexité en ferait une cible.
- Ne jamais modifier une migration Alembic déjà appliquée en prod.
- Ne jamais committer de dump SQL ni de données de production réelles —
  déjà arrivé sur ce repo (dumps/zip à la racine, en cours de nettoyage).

---

## Règles de modification du code

**Modifier, ne pas empiler.** Quand une fonction, un composant ou un endpoint
existant doit changer de comportement, modifie-le. N'écris pas une seconde
version à côté. Pas de `handleSubmitV2`, `parseDataNew`, `utils2.ts`.

**Ce que tu remplaces, tu le supprimes.** Si ton changement rend du code
inatteignable — ancienne branche, import devenu inutile, helper qui n'a plus
qu'un appelant, feature flag résolu — supprime-le dans le même changement.
Le code mort n'est pas neutre : il sera lu, maintenu et copié par erreur.

**Pas de code commenté.** L'historique git est là pour ça.

**Pas de compatibilité ascendante non demandée.** Ne conserve pas une ancienne
signature « au cas où ». Si un appelant existe encore, mets-le à jour ; s'il
n'en existe pas, supprime.

**Pas d'abstraction spéculative.** Une seule implémentation ne justifie pas une
interface. Trois répétitions justifient une factorisation, pas deux.

**Signale au lieu d'ajouter.** Si le code existant t'empêche de faire propre,
dis-le et propose le refactor. Ne contourne pas en ajoutant une couche.

## Définition de « terminé »

Avant d'annoncer qu'une tâche est finie, tous ces points doivent être vrais :

1. La suite de tests passe, et les nouveaux cas sont couverts — y compris les
   cas d'erreur, pas seulement le chemin nominal.
2. Le linter est propre. Zéro avertissement d'import ou de variable inutilisés.
3. Aucun code devenu inatteignable n'a été laissé derrière.
4. Aucun `TODO`, `FIXME` ni `console.log` de debug oublié.
5. La documentation est à jour (voir ci-dessous).
6. Tu as listé ce que tu n'as **pas** fait et pourquoi : limites connues,
   cas non traités, dettes assumées.

## Documentation de chaque livraison

Toute livraison s'accompagne de sa documentation, écrite dans le même passage
que le code — jamais « plus tard ».

- **README à la racine** : à quoi sert le projet, prérequis, installation,
  configuration (`.env`), lancement, tests, déploiement, exemples d'usage.
  Tenu à jour dès qu'une API publique ou une procédure change.
- **README local** pour tout module, service ou script autonome : son rôle,
  ses entrées/sorties, comment le lancer seul.
- **Tout script livrable** est auto-documenté : en-tête expliquant ce qu'il
  fait, ses arguments, ses variables d'environnement, un exemple d'appel.
- **Décisions structurantes** : quand un choix technique ferme d'autres
  options, écris-le en trois lignes — le choix, l'alternative écartée, la
  raison. Sans ça, personne ne saura dans six mois pourquoi c'est comme ça.

Documente les décisions et les pièges, pas la syntaxe. Un commentaire qui
paraphrase la ligne suivante est du bruit.

## Suggestions d'amélioration

À la fin de chaque jalon — pas à chaque message — termine par une section
**Pistes d'amélioration** :

- Trois propositions maximum, classées par rapport valeur/effort.
- Chacune en deux lignes : le gain concret, le coût estimé.
- Uniquement ce que tu as réellement constaté dans CE code : duplication vue,
  requête qui ne passera pas à l'échelle, cas limite non traité, dépendance
  problématique, angle mort de sécurité ou d'accessibilité.
- Pas de généralités, pas d'effet de mode. « Ajouter des tests » ou « migrer
  vers le framework du moment » n'est pas une suggestion, c'est du remplissage.
- **Tu ne les implémentes pas.** Tu les proposes, j'arbitre.

Si tu ne vois rien de solide à proposer, écris « rien à signaler ». C'est une
réponse valable, et préférable à une liste inventée.
