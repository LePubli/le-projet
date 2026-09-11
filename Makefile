.PHONY: help up down build rebuild logs logs-b logs-f ps migrate revision rollback rollback-all history shell-b clean

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## Démarre tous les services (detach)
	docker compose up -d

build: ## Build les images sans démarrer
	docker compose build

rebuild: ## Rebuild complet (no cache) + redémarre
	docker compose build --no-cache && docker compose up -d

down: ## Arrête les conteneurs
	docker compose down

down-v: ## Arrête + supprime les volumes (DESTRUCTIF)
	docker compose down -v

logs: ## Logs de tous les services
	docker compose logs -f --tail=100

logs-b: ## Logs backend uniquement
	docker compose logs -f --tail=100 backend

logs-f: ## Logs frontend uniquement
	docker compose logs -f --tail=100 frontend

ps: ## État des conteneurs
	docker compose ps

migrate: ## Exécute les migrations Alembic
	docker compose exec backend alembic upgrade head

revision: ## Crée une nouvelle migration Alembic (usage: make revision m="description")
	@test -n "$(m)" || (echo "Usage: make revision m=\"description de la migration\"" && exit 1)
	docker compose exec backend alembic revision --autogenerate -m "$(m)"

rollback: ## Rollback une migration
	docker compose exec backend alembic downgrade -1

rollback-all: ## Rollback toutes les migrations (DESTRUCTIF)
	docker compose exec backend alembic downgrade base

history: ## Historique des migrations
	docker compose exec backend alembic history

shell-b: ## Shell dans le conteneur backend
	docker compose exec backend bash

shell-f: ## Shell dans le conteneur frontend
	docker compose exec frontend sh

test-b: ## Lance les tests backend
	cd backend && pytest -v

test-f: ## Lance les tests frontend
	cd frontend && npm test

lint-b: ## Lint backend (flake8 + black check)
	cd backend && flake8 app tests && black --check app tests

lint-f: ## Lint frontend (eslint)
	cd frontend && npm run lint

clean: ## Nettoie conteneurs + images orphelines
	docker compose down --rmi local --volumes
