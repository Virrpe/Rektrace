# Vector Stack Observability Finalization Specification

## Executive Summary
This specification defines the complete requirements for finalizing vector stack observability with TDD anchors, focusing on Grafana dashboard provisioning, Pushgateway integration, Prometheus configuration, and indexer metrics emission.

## Current State Analysis
- **Grafana**: Running on port 3000 with basic provisioning
- **Prometheus**: Running on port 9090 with minimal scrape configuration
- **Missing**: Vector metrics integration, Pushgateway, comprehensive dashboards
- **Configuration**: Uses environment variables for secrets management

## 1. Grafana Dashboard Provisioning Fix

### 1.1 Requirements
- [ ] Auto-provision dashboards from JSON files
- [ ] Support dashboard versioning and rollback
- [ ] Enable dynamic dashboard updates without restart
- [ ] Include vector-specific metrics panels

### 1.2 Configuration Structure
```yaml
# observability/grafana/provisioning/dashboards/vector.yml
apiVersion: 1
providers:
  - name: 'vector-metrics'
    orgId: 1
    folder: 'Vector Stack'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 5
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards/vector
```

### 1.3 Dashboard JSON Template
```json
{
  "dashboard": {
    "id": null,
    "title": "Vector Stack Overview",
    "tags": ["vector", "metrics", "observability"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Vector Events/sec",
        "type": "stat",
        "targets": [{
          "expr": "rate(vector_events_total[5m])",
          "refId": "A"
        }]
      }
    ]
  }
}
```

## 2. Pushgateway Integration Architecture

### 2.1 Service Definition
```yaml
# docker-compose.yml addition
pushgateway:
  image: prom/pushgateway:latest
  ports:
    - "9091:9091"
  restart: unless-stopped
  healthcheck:
    test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9091/-/healthy || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### 2.2 Metrics Endpoint Design
```typescript
// src/observability/metrics/VectorMetricsCollector.ts
interface VectorMetricsCollector {
  pushMetrics(metrics: VectorMetrics): Promise<void>
  createBatch(): MetricsBatch
  flush(): Promise<void>
}

interface VectorMetrics {
  eventsProcessed: number
  bytesIngested: number
  processingTime: number
  errorCount: number
  component: string
}
```

### 2.3 Pushgateway Client Implementation
```typescript
class PushgatewayClient implements MetricsPusher {
  private readonly gatewayUrl: string
  private readonly jobName: string
  
  constructor(config: PushgatewayConfig) {
    this.gatewayUrl = config.url
    this.jobName = config.jobName
  }
  
  async push(metrics: Metric[]): Promise<void> {
    const payload = this.formatMetrics(metrics)
    await fetch(`${this.gatewayUrl}/metrics/job/${this.jobName}`, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}
```

## 3. Prometheus Scrape Configuration

### 3.1 Enhanced Configuration
```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['prometheus:9090']

  - job_name: 'pushgateway'
    static_configs:
      - targets: ['pushgateway:9091']
    honor_labels: true

  - job_name: 'vector'
    static_configs:
      - targets: ['vector:8686']
    metrics_path: /metrics
    scrape_interval: 5s

  - job_name: 'rektrace-indexer'
    static_configs:
      - targets: ['rektrace:8080']
    metrics_path: /metrics
    scrape_interval: 10s
```

### 3.2 Service Discovery
```yaml
# Additional scrape configs for dynamic discovery
  - job_name: 'vector-kubernetes'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
```

## 4. Indexer Metrics Emission Interface

### 4.1 Metrics Interface Design
```typescript
// src/observability/metrics/IndexerMetrics.ts
interface IndexerMetrics {
  // Processing metrics
  blocksProcessed: Counter
  transactionsIndexed: Counter
  eventsEmitted: Counter
  
  // Performance metrics
  processingDuration: Histogram
  queueDepth: Gauge
  
  // Error metrics
  processingErrors: Counter
  retryAttempts: Counter
  
  // Resource metrics
  memoryUsage: Gauge
  cpuUsage: Gauge
}

class IndexerMetricsCollector {
  private registry: Registry
  
  constructor(registry: Registry) {
    this.registry = registry
    this.initializeMetrics()
  }
  
  recordBlockProcessed(height: number, duration: number): void {
    this.metrics.blocksProcessed.inc()
    this.metrics.processingDuration.observe(duration)
  }
  
  recordError(errorType: string): void {
    this.metrics.processingErrors.inc({ type: errorType })
  }
}
```

### 4.2 Metrics Emission Patterns
```typescript
// src/observability/metrics/MetricsEmitter.ts
class MetricsEmitter {
  private readonly collector: IndexerMetricsCollector
  private readonly pushgateway: PushgatewayClient
  
  async emitProcessingComplete(block: BlockData): Promise<void> {
    const labels = {
      chain: block.chainId,
      height: block.height.toString()
    }
    
    this.collector.recordBlockProcessed(block.height, block.processingTime)
    await this.pushgateway.push([{
      name: 'indexer_block_processed_total',
      value: 1,
      labels
    }])
  }
}
```

## 5. Evidence Collection Requirements

### 5.1 Acceptance Criteria Evidence
- [ ] **Dashboard Provisioning**: Screenshot of auto-provisioned dashboards
- [ ] **Metrics Availability**: Prometheus query results for vector metrics
- [ ] **Pushgateway Integration**: Successful pushgateway metrics push logs
- [ ] **Indexer Metrics**: Grafana dashboard showing indexer metrics
- [ ] **No Secrets**: Configuration audit report showing no hard-coded secrets

### 5.2 Test Evidence Collection
```typescript
// tests/observability/ObservabilityEvidenceCollector.ts
class ObservabilityEvidenceCollector {
  async collectDashboardEvidence(): Promise<Evidence> {
    const dashboard = await this.grafana.getDashboard('vector-stack-overview')
    return {
      type: 'dashboard',
      screenshot: await this.captureScreenshot(dashboard.url),
      metrics: await this.extractMetrics(dashboard)
    }
  }
  
  async collectMetricsEvidence(): Promise<Evidence> {
    const metrics = await this.prometheus.query('vector_events_total')
    return {
      type: 'metrics',
      data: metrics,
      timestamp: new Date().toISOString()
    }
  }
}
```

## 6. TDD Test Cases

### 6.1 Grafana Dashboard Tests
```typescript
describe('GrafanaDashboardProvisioning', () => {
  it('should auto-provision vector dashboards', async () => {
    const dashboards = await grafana.listDashboards()
    expect(dashboards).toContain('vector-stack-overview')
  })
  
  it('should update dashboards without restart', async () => {
    const initialVersion = await grafana.getDashboardVersion('vector-stack-overview')
    await grafana.updateDashboard('vector-stack-overview', newConfig)
    const updatedVersion = await grafana.getDashboardVersion('vector-stack-overview')
    expect(updatedVersion).toBeGreaterThan(initialVersion)
  })
})
```

### 6.2 Pushgateway Integration Tests
```typescript
describe('PushgatewayIntegration', () => {
  it('should successfully push metrics', async () => {
    const metrics = [{ name: 'test_metric', value: 1, labels: {} }]
    await pushgateway.push(metrics)
    
    const pushed = await prometheus.query('test_metric')
    expect(pushed).toHaveLength(1)
  })
  
  it('should handle push failures gracefully', async () => {
    const invalidMetrics = [{ name: 'invalid-metric', value: 'not-a-number' }]
    await expect(pushgateway.push(invalidMetrics)).rejects.toThrow()
  })
})
```

### 6.3 Prometheus Configuration Tests
```typescript
describe('PrometheusConfiguration', () => {
  it('should scrape pushgateway metrics', async () => {
    const targets = await prometheus.getTargets()
    expect(targets).toContain('pushgateway:9091')
  })
  
  it('should scrape vector metrics', async () => {
    const targets = await prometheus.getTargets()
    expect(targets).toContain('vector:8686')
  })
})
```

### 6.4 Indexer Metrics Tests
```typescript
describe('IndexerMetrics', () => {
  it('should emit block processing metrics', async () => {
    const initialCount = await prometheus.query('indexer_blocks_processed_total')
    await indexer.processBlock(testBlock)
    const updatedCount = await prometheus.query('indexer_blocks_processed_total')
    expect(updatedCount).toBeGreaterThan(initialCount)
  })
  
  it('should emit error metrics', async () => {
    const initialErrors = await prometheus.query('indexer_processing_errors_total')
    await indexer.simulateError()
    const updatedErrors = await prometheus.query('indexer_processing_errors_total')
    expect(updatedErrors).toBeGreaterThan(initialErrors)
  })
})
```

## 7. Configuration Security

### 7.1 Environment Variables
```bash
# .env.example
PROMETHEUS_URL=http://prometheus:9090
GRAFANA_ADMIN_PASSWORD=secure_password_here
PUSHGATEWAY_URL=http://pushgateway:9091
VECTOR_METRICS_PORT=8686
```

### 7.2 Secret Management
```typescript
// src/config/ObservabilityConfig.ts
class ObservabilityConfig {
  static fromEnv(): ObservabilityConfig {
    return {
      prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
      grafanaAdminPassword: process.env.GRAFANA_ADMIN_PASSWORD,
      pushgatewayUrl: process.env.PUSHGATEWAY_URL || 'http://pushgateway:9091',
      vectorMetricsPort: parseInt(process.env.VECTOR_METRICS_PORT || '8686')
    }
  }
}
```

## 8. Implementation Checklist

### Phase 1: Infrastructure Setup
- [ ] Add pushgateway service to docker-compose.yml
- [ ] Update prometheus.yml with new scrape configs
- [ ] Create vector dashboard JSON files
- [ ] Update Grafana provisioning configuration

### Phase 2: Metrics Integration
- [ ] Implement Pushgateway client
- [ ] Create indexer metrics collector
- [ ] Add vector metrics endpoint
- [ ] Configure metrics emission patterns

### Phase 3: Testing & Validation
- [ ] Write TDD test cases
- [ ] Run integration tests
- [ ] Collect evidence for acceptance criteria
- [ ] Perform security audit

### Phase 4: Documentation
- [ ] Update deployment documentation
- [ ] Create metrics reference guide
- [ ] Document troubleshooting procedures
- [ ] Create runbook for observability issues

## 9. Monitoring & Alerting

### 9.1 Alert Rules
```yaml
# prometheus/alerts.yml
groups:
  - name: vector-alerts
    rules:
      - alert: VectorHighErrorRate
        expr: rate(vector_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in vector processing"
```

### 9.2 Health Checks
```typescript
// src/observability/health/HealthChecker.ts
class HealthChecker {
  async checkObservabilityStack(): Promise<HealthStatus> {
    const checks = await Promise.all([
      this.checkPrometheus(),
      this.checkGrafana(),
      this.checkPushgateway(),
      this.checkVectorMetrics()
    ])
    
    return {
      overall: checks.every(c => c.healthy),
      components: checks
    }
  }
}
```

## 10. Performance Considerations

### 10.1 Metrics Volume Management
- Batch metrics pushes to reduce network overhead
- Implement metric sampling for high-volume events
- Use metric retention policies to manage storage

### 10.2 Resource Limits
```yaml
# docker-compose.yml resource limits
deploy:
  resources:
    limits:
      memory: 256M
      cpus: '0.5'
    reservations:
      memory: 128M
      cpus: '0.25'
```

## Conclusion
This specification provides a complete roadmap for implementing vector stack observability with TDD anchors. Each component has defined test cases, configuration examples, and evidence collection requirements. The implementation follows security best practices with no hard-coded secrets and comprehensive monitoring coverage.