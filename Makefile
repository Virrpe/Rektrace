# Rektrace Development Makefile
# Provides ergonomic targets for development workflow

.PHONY: help dev-up dev-down dev-restart dev-logs dev-status dev-urls \
        obs obs-logs obs-restart obs-status \
        logs ps clean prune test lint build \
        install install-dev setup systemd-install systemd-enable systemd-start \
        grafana-reload

# Default target
.DEFAULT_GOAL := help

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

# Configuration
DEV_SCRIPT := ./scripts/dev.sh
COMPOSE_FILE := docker-compose.yml
SYSTEMD_DIR := ~/.config/systemd/user

# Help target - shows all available targets
help: ## Show this help message
	@echo "$(GREEN)Rektrace Development Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Development Environment:$(NC)"
	@echo "  dev-up        Start development environment with health checks"
	@echo "  dev-down      Stop development environment"
	@echo "  dev-restart   Restart development environment"
	@echo "  dev-logs      Show logs for development services"
	@echo "  dev-status    Show status of development services"
	@echo "  dev-urls      Show URLs for development services"
	@echo ""
	@echo "$(YELLOW)Observability Stack:$(NC)"
	@echo "  obs           Start observability stack (Prometheus, Grafana, Jaeger)"
	@echo "  obs-logs      Show logs for observability services"
	@echo "  obs-restart   Restart observability services"
	@echo "  obs-status    Show status of observability services"
	@echo ""
	@echo "$(YELLOW)Utility Commands:$(NC)"
	@echo "  logs          Show logs for all services"
	@echo "  ps            Show running services"
	@echo "  clean         Clean up containers and volumes"
	@echo "  prune         Prune Docker system"
	@echo "  test          Run tests"
	@echo "  lint          Run linting"
	@echo "  build         Build application"
	@echo ""
	@echo "$(YELLOW)System Setup:$(NC)"
	@echo "  install       Install dependencies"
	@echo "  install-dev   Install development dependencies"
	@echo "  setup         Initial project setup"
	@echo "  systemd-install  Install systemd user units"
	@echo "  systemd-enable  Enable systemd user units"
	@echo "  systemd-start   Start systemd user units"

# Development environment targets
dev-up: ## Start development environment with health checks
	@echo "$(GREEN)Starting development environment...$(NC)"
	@$(DEV_SCRIPT) start

dev-down: ## Stop development environment
	@echo "$(YELLOW)Stopping development environment...$(NC)"
	@$(DEV_SCRIPT) stop

dev-restart: ## Restart development environment
	@echo "$(GREEN)Restarting development environment...$(NC)"
	@$(DEV_SCRIPT) restart

dev-logs: ## Show logs for development services
	@$(DEV_SCRIPT) logs

dev-status: ## Show status of development services
	@$(DEV_SCRIPT) status

dev-urls: ## Show URLs for development services
	@$(DEV_SCRIPT) urls

# Observability stack targets
obs: ## Start observability stack
	@echo "$(GREEN)Starting observability stack...$(NC)"
	@docker-compose up -d prometheus grafana jaeger

obs-logs: ## Show logs for observability services
	@docker-compose logs -f prometheus grafana jaeger

obs-restart: ## Restart observability services
	@echo "$(YELLOW)Restarting observability services...$(NC)"
	@docker-compose restart prometheus grafana jaeger

obs-status: ## Show status of observability services
	@docker-compose ps prometheus grafana jaeger

# Utility targets
logs: ## Show logs for all services
	@docker-compose logs -f

ps: ## Show running services
	@docker-compose ps

clean: ## Clean up containers and volumes
	@echo "$(RED)Cleaning up containers and volumes...$(NC)"
	@docker-compose down -v --remove-orphans

prune: ## Prune Docker system
	@echo "$(YELLOW)Pruning Docker system...$(NC)"
	@docker system prune -af

test: ## Run tests
	@echo "$(GREEN)Running tests...$(NC)"
	@npm test

lint: ## Run linting
	@echo "$(GREEN)Running linting...$(NC)"
	@npm run lint

build: ## Build application
	@echo "$(GREEN)Building application...$(NC)"
	@npm run build

# Installation targets
install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	@npm install

install-dev: ## Install development dependencies
	@echo "$(GREEN)Installing development dependencies...$(NC)"
	@npm install --include=dev

setup: ## Initial project setup
	@echo "$(GREEN)Setting up project...$(NC)"
	@cp .env.example .env
	@npm install
	@echo "$(GREEN)Project setup complete! Run 'make dev-up' to start development environment.$(NC)"

# Systemd targets
systemd-install: ## Install systemd user units
	@echo "$(GREEN)Installing systemd user units...$(NC)"
	@mkdir -p $(SYSTEMD_DIR)
	@cp systemd/rektrace-dev.service $(SYSTEMD_DIR)/
	@cp systemd/rektrace-obs.service $(SYSTEMD_DIR)/
	@systemctl --user daemon-reload

systemd-enable: ## Enable systemd user units
	@echo "$(GREEN)Enabling systemd user units...$(NC)"
	@systemctl --user enable rektrace-dev.service
	@systemctl --user enable rektrace-obs.service

systemd-start: ## Start systemd user units
	@echo "$(GREEN)Starting systemd user units...$(NC)"
	@systemctl --user start rektrace-dev.service
	@systemctl --user start rektrace-obs.service

# Quick aliases for common workflows
up: dev-up ## Alias for dev-up
down: dev-down ## Alias for dev-down
restart: dev-restart ## Alias for dev-restart
status: dev-status ## Alias for dev-status

# Development workflow shortcuts
dev: dev-up ## Quick start development environment
obs-up: obs ## Quick start observability stack
obs-down: ## Stop observability stack
	@docker-compose stop prometheus grafana jaeger

# Quick health check
health: ## Quick health check of all services
	@echo "$(GREEN)Checking service health...$(NC)"
	@$(DEV_SCRIPT) status
	@echo ""
	@echo "$(GREEN)Service URLs:$(NC)"
	@$(DEV_SCRIPT) urls

grafana-reload: ## Reload Grafana dashboards and datasources
	@echo "$(GREEN)Reloading Grafana configuration...$(NC)"
	@docker-compose restart grafana
	@echo "$(GREEN)Grafana reloaded!$(NC)"

# Qdrant and indexing targets
qdrant: ## Start Qdrant vector database
	@echo "$(GREEN)Starting Qdrant...$(NC)"
	@docker-compose up -d qdrant

qdrant-down: ## Stop Qdrant vector database
	@echo "$(YELLOW)Stopping Qdrant...$(NC)"
	@docker-compose stop qdrant

index: ## Index documentation into Qdrant
	@echo "$(GREEN)Indexing documentation...$(NC)"
	@python scripts/index_docs.py

index-recreate: ## Recreate collection and index documentation
	@echo "$(GREEN)Recreating collection and indexing documentation...$(NC)"
	@python scripts/index_docs.py --recreate

grafana-reload: ## Reload Grafana dashboards and datasources
	@echo "$(GREEN)Reloading Grafana configuration...$(NC)"
	@docker-compose restart grafana
	@echo "$(GREEN)Grafana reloaded!$(NC)"