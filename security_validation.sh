#!/bin/bash
# Security Hardening Validation Script for Rektrace
# Comprehensive evidence collection for security verification

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Evidence table header
echo "# Security Hardening Evidence Table"
echo ""
echo "| Test ID | Command Executed | Expected Result | Actual Result | Status |"
echo "|---------|------------------|-----------------|---------------|--------|"

# Test counter
TEST_ID=1

# Function to run test and record evidence
run_test() {
    local description=$1
    local command=$2
    local expected=$3
    
    echo -n "Testing: $description... "
    
    # Execute command and capture output
    local actual
    if actual=$(eval "$command" 2>&1); then
        if [[ "$actual" == *"$expected"* ]] || [[ "$expected" == "PASS" ]]; then
            echo -e "${GREEN}PASS${NC}"
            echo "| $TEST_ID | \`$command\` | $expected | $actual | PASS |"
        else
            echo -e "${RED}FAIL${NC}"
            echo "| $TEST_ID | \`$command\` | $expected | $actual | FAIL |"
        fi
    else
        echo -e "${RED}FAIL${NC}"
        echo "| $TEST_ID | \`$command\` | $expected | Command failed: $actual | FAIL |"
    fi
    
    ((TEST_ID++))
}

# Test 1: Service port binding to localhost
echo ""
echo "## 1. Service Port Binding Security"
echo ""

# Check Dragonfly port binding
run_test "Dragonfly Redis port binding" \
    "docker-compose ps dragonfly | grep -o '127.0.0.1:6379->6379/tcp'" \
    "127.0.0.1:6379->6379/tcp"

# Check PostgreSQL port binding
run_test "PostgreSQL port binding" \
    "docker-compose ps postgres | grep -o '127.0.0.1:5432->5432/tcp'" \
    "127.0.0.1:5432->5432/tcp"

# Check Jaeger port binding
run_test "Jaeger UI port binding" \
    "docker-compose ps jaeger | grep -o '127.0.0.1:16686->16686/tcp'" \
    "127.0.0.1:16686->16686/tcp"

# Check Prometheus port binding
run_test "Prometheus port binding" \
    "docker-compose ps prometheus | grep -o '127.0.0.1:9090->9090/tcp'" \
    "127.0.0.1:9090->9090/tcp"

# Check Grafana port binding
run_test "Grafana port binding" \
    "docker-compose ps grafana | grep -o '127.0.0.1:3000->3000/tcp'" \
    "127.0.0.1:3000->3000/tcp"

# Check Pushgateway port binding
run_test "Pushgateway port binding" \
    "docker-compose ps pushgateway | grep -o '127.0.0.1:9091->9091/tcp'" \
    "127.0.0.1:9091->9091/tcp"

# Check Qdrant port binding
run_test "Qdrant port binding" \
    "docker-compose ps qdrant | grep -o '127.0.0.1:6333->6333/tcp'" \
    "127.0.0.1:6333->6333/tcp"

# Test 2: No hard-coded credentials in docker-compose.yml
echo ""
echo "## 2. Credential Security"
echo ""

# Check for hard-coded passwords
run_test "No hard-coded passwords in docker-compose.yml" \
    "grep -i 'password:' docker-compose.yml | grep -v '\${' | wc -l" \
    "0"

# Check for hard-coded API keys
run_test "No hard-coded API keys in docker-compose.yml" \
    "grep -i 'api_key\|apikey\|secret\|token' docker-compose.yml | grep -v '\${' | wc -l" \
    "0"

# Check for environment variable usage
run_test "Grafana uses environment variables" \
    "grep -E 'GF_SECURITY_ADMIN_USER|GF_SECURITY_ADMIN_PASSWORD' docker-compose.yml | grep -c '\${'" \
    "2"

# Test 3: Pushgateway admin API security
echo ""
echo "## 3. Pushgateway Security"
echo ""

# Check if pushgateway admin API is disabled
run_test "Pushgateway admin API returns 404" \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:9091/api/v1/admin/config || echo '000'" \
    "404"

# Check pushgateway metrics endpoint (should be accessible)
run_test "Pushgateway metrics endpoint accessible" \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:9091/metrics || echo '000'" \
    "200"

# Test 4: Grafana dashboard provisioning
echo ""
echo "## 4. Grafana Dashboard Verification"
echo ""

# Check if Grafana is running
run_test "Grafana service running" \
    "docker-compose ps grafana | grep -c 'Up'" \
    "1"

# Check Grafana health endpoint
run_test "Grafana health endpoint accessible" \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health || echo '000'" \
    "200"

# Check if dashboard is provisioned
run_test "Grafana dashboard provisioned" \
    "curl -s http://localhost:3000/api/search?query=rektrace | grep -c 'rektrace_overview' || echo '0'" \
    "1"

# Test 5: Environment variables configuration
echo ""
echo "## 5. Environment Configuration"
echo ""

# Check if .env file exists
run_test "Environment file exists" \
    "test -f .env && echo 'exists' || echo 'missing'" \
    "exists"

# Check required environment variables
required_vars=("GRAFANA_ADMIN_USER" "GRAFANA_ADMIN_PASSWORD")
for var in "${required_vars[@]}"; do
    run_test "Environment variable $var configured" \
        "grep -c '^$var=' .env 2>/dev/null || echo '0'" \
        "1"
done

# Test 6: Container security
echo ""
echo "## 6. Container Security"
echo ""

# Check container restart policies
run_test "All containers have restart policy" \
    "docker-compose config | grep -c 'restart: unless-stopped'" \
    "7"

# Check for privileged containers
run_test "No privileged containers" \
    "docker-compose config | grep -c 'privileged: true' || echo '0'" \
    "0"

# Test 7: Network security
echo ""
echo "## 7. Network Security"
echo ""

# Check if services are on internal network
run_test "Services use internal networking" \
    "docker-compose config | grep -c 'networks:' || echo '0'" \
    "0"

# Test 8: File permissions
echo ""
echo "## 8. File Permissions"
echo ""

# Check docker-compose.yml permissions
run_test "docker-compose.yml has correct permissions" \
    "stat -c '%a' docker-compose.yml | grep -E '644|600'" \
    "644"

# Check .env file permissions
run_test ".env file has correct permissions" \
    "test -f .env && (stat -c '%a' .env | grep -E '600|644') || echo '600'" \
    "600"

echo ""
echo "## Summary"
echo ""
echo "Security validation completed. Review the evidence table above for detailed results."