#!/usr/bin/env bash
set -euo pipefail

# Rektrace development environment bootstrap script
# Provides health probe with retry logic for docker-compose services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MAX_RETRIES=30
RETRY_DELAY=2
HEALTH_CHECK_TIMEOUT=5

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi
}

check_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed"
        exit 1
    fi
}

get_compose_cmd() {
    if docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

wait_for_service() {
    local service_name=$1
    local health_cmd=$2
    local max_retries=$3
    
    log "Waiting for $service_name to be healthy..."
    
    for i in $(seq 1 "$max_retries"); do
        if eval "$health_cmd" &> /dev/null; then
            log "✓ $service_name is healthy"
            return 0
        fi
        
        if [ $i -eq $max_retries ]; then
            error "✗ $service_name failed to become healthy after $max_retries attempts"
            return 1
        fi
        
        warn "$service_name not ready yet (attempt $i/$max_retries), waiting ${RETRY_DELAY}s..."
        sleep "$RETRY_DELAY"
    done
}

health_check_dragonfly() {
    docker exec rektrace-dragonfly-1 redis-cli ping | grep -q PONG
}

health_check_postgres() {
    docker exec rektrace-postgres-1 pg_isready -U rektrace -d rektrace | grep -q "accepting connections"
}

health_check_jaeger() {
    curl -s -f http://localhost:16686/health &> /dev/null
}

health_check_prometheus() {
    curl -s -f http://localhost:9090/-/healthy &> /dev/null
}

health_check_grafana() {
    curl -s -f http://localhost:3000/api/health &> /dev/null
}

start_dev_environment() {
    local compose_cmd=$(get_compose_cmd)
    
    log "Starting Rektrace development environment..."
    
    # Start services
    $compose_cmd up -d
    
    # Wait for services to be healthy
    wait_for_service "Dragonfly" "health_check_dragonfly" "$MAX_RETRIES"
    wait_for_service "PostgreSQL" "health_check_postgres" "$MAX_RETRIES"
    wait_for_service "Jaeger" "health_check_jaeger" "$MAX_RETRIES"
    wait_for_service "Prometheus" "health_check_prometheus" "$MAX_RETRIES"
    wait_for_service "Grafana" "health_check_grafana" "$MAX_RETRIES"
    
    log "All services are healthy!"
    log "Development environment is ready"
    
    # Display URLs
    echo ""
    log "Available services:"
    echo "  🐉 Dragonfly (Redis): localhost:6379"
    echo "  🐘 PostgreSQL: localhost:5432"
    echo "  🔍 Jaeger: http://localhost:16686"
    echo "  📊 Prometheus: http://localhost:9090"
    echo "  📈 Grafana: http://localhost:3000 (admin/grafana)"
}

stop_dev_environment() {
    local compose_cmd=$(get_compose_cmd)
    
    log "Stopping Rektrace development environment..."
    $compose_cmd down
}

show_status() {
    local compose_cmd=$(get_compose_cmd)
    
    log "Development environment status:"
    $compose_cmd ps
}

show_logs() {
    local compose_cmd=$(get_compose_cmd)
    local service=${1:-}
    
    if [ -n "$service" ]; then
        log "Showing logs for service: $service"
        $compose_cmd logs -f "$service"
    else
        log "Showing logs for all services"
        $compose_cmd logs -f
    fi
}

show_urls() {
    log "Service URLs:"
    echo "  🐉 Dragonfly (Redis): redis://localhost:6379"
    echo "  🐘 PostgreSQL: postgresql://rektrace:rektrace@localhost:5432/rektrace"
    echo "  🔍 Jaeger: http://localhost:16686"
    echo "  📊 Prometheus: http://localhost:9090"
    echo "  📈 Grafana: http://localhost:3000 (admin/grafana)"
}

main() {
    case "${1:-start}" in
        start|up)
            check_docker
            check_compose
            start_dev_environment
            ;;
        stop|down)
            check_docker
            check_compose
            stop_dev_environment
            ;;
        status|ps)
            check_docker
            check_compose
            show_status
            ;;
        logs)
            check_docker
            check_compose
            show_logs "$2"
            ;;
        urls)
            show_urls
            ;;
        restart)
            check_docker
            check_compose
            stop_dev_environment
            sleep 2
            start_dev_environment
            ;;
        *)
            echo "Usage: $0 {start|stop|restart|status|logs|urls}"
            echo ""
            echo "Commands:"
            echo "  start    Start development environment with health checks"
            echo "  stop     Stop development environment"
            echo "  restart  Restart development environment"
            echo "  status   Show service status"
            echo "  logs     Show logs (optionally specify service name)"
            echo "  urls     Show service URLs"
            exit 1
            ;;
    esac
}

main "$@"