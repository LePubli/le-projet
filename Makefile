# Le fichier compose est dans local/ (et non à la racine) pour que DockPanel
# Git Deploy ne le détecte pas. --project-directory . garde .env et les chemins
# de build relatifs à la racine du dépôt.
COMPOSE = docker compose -f local/docker-compose.yml --project-directory .

.PHONY: help up down build rebuild logs logs-b logs-f ps migrate revision rollback rollback-all history shell-b clean

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## Démarre tous les services (detach)
	$(COMPOSE) up -d

build: ## Build les images sans démarrer
	$(COMPOSE) build

rebuild: ## Rebuild complet (no cache) + redémarre
	$(COMPOSE) build --no-cache && $(COMPOSE) up -d

down: ## Arrête les conteneurs
	$(COMPOSE) down

down-v: ## Arrête + supprime les volumes (DESTRUCTIF)
	$(COMPOSE) down -v

logs: ## Logs de tous les services
	$(COMPOSE) logs -f --tail=100

logs-b: ## Logs backend uniquement
	$(COMPOSE) logs -f --tail=100 backend

logs-f: ## Logs frontend uniquement
	$(COMPOSE) logs -f --tail=100 frontend

ps: ## État des conteneurs
	$(COMPOSE) ps

migrate: ## Exécute les migrations Alembic
	$(COMPOSE) exec backend alembic upgrade head

revision: ## Crée une nouvelle migration Alembic (usage: make revision m="description")
	@test -n "$(m)" || (echo "Usage: make revision m=\"description de la migration\"" && exit 1)
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(m)"

rollback: ## Rollback une migration
	$(COMPOSE) exec backend alembic downgrade -1

rollback-all: ## Rollback toutes les migrations (DESTRUCTIF)
	$(COMPOSE) exec backend alembic downgrade base

history: ## Historique des migrations
	$(COMPOSE) exec backend alembic history

shell-b: ## Shell dans le conteneur backend
	$(COMPOSE) exec backend bash

shell-f: ## Shell dans le conteneur frontend
	$(COMPOSE) exec frontend sh

test-b: ## Lance les tests backend
	cd backend && pytest -v

test-f: ## Lance les tests frontend
	cd frontend && npm test

lint-b: ## Lint backend (flake8 + black check)
	cd backend && flake8 app tests && black --check app tests

lint-f: ## Lint frontend (eslint)
	cd frontend && npm run lint

clean: ## Nettoie conteneurs + images orphelines
	$(COMPOSE) down --rmi local --volumes
