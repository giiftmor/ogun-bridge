.PHONY: help build up down restart logs clean ps

help:
	@echo "ALSM Docker Management"
	@echo ""
	@echo "make build    - Build Docker images"
	@echo "make up      - Start all services"
	@echo "make down    - Stop all services"
	@echo "make restart - Restart all services"
	@echo "make logs    - View logs"
	@echo "make clean   - Remove containers and volumes"
	@echo "make ps      - Show running containers"

build:
	docker-compose build

up:
	docker-compose up -d
	@echo "Services started:"
	@echo "  Frontend: http://localhost:3331"
	@echo "  Backend:  http://localhost:3333"

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-frontend:
	docker-compose logs -f frontend

clean:
	docker-compose down -v
	@echo "Removed containers and volumes"

ps:
	docker-compose ps

# Database helpers
db-backup:
	docker-compose exec postgres pg_dump -U postgres alsm_ui > backup_$$(date +%Y%m%d_%H%M%S).sql

db-restore:
	@read -p "Enter backup file: " file; \
	docker-compose exec -T postgres psql -U postgres alsm_ui < $$file

# Shell access
shell-backend:
	docker-compose exec backend sh

shell-frontend:
	docker-compose exec frontend sh

shell-db:
	docker-compose exec postgres psql -U postgres -d alsm_ui
