# TDD Test Cases for Vector Stack Observability

## Test Suite Overview
Comprehensive test-driven development test cases for validating vector stack observability implementation.

## 1. Grafana Dashboard Provisioning Tests

### 1.1 Dashboard Auto-Provisioning
```typescript
// tests/observability/grafana/dashboard_provisioning.test.ts
describe('GrafanaDashboardProvisioning', () => {
  let grafanaClient: GrafanaClient
  let provisioningService: DashboardProvisioningService

  beforeEach(() => {
    grafanaClient = new GrafanaClient({
      url: process.env.GRAFANA_URL || 'http://localhost:3000',
      username: process.env.GRAFANA_USERNAME || 'admin',
      password: process.env.GRAFANA_PASSWORD
    })
    provisioningService = new DashboardProvisioningService(grafanaClient)
  })

  it('should provision vector dashboards on startup', async () => {
    // Given: Clean Grafana instance
    await grafanaClient.deleteAllDashboards()
    
    // When: Provisioning service starts
    await provisioningService.provision()
    
    // Then: Vector dashboards should exist
    const dashboards = await grafanaClient.listDashboards()
    const vectorDashboards = dashboards.filter(d => d.tags.includes('vector'))
    
    expect(vectorDashboards).toHaveLength(3)
    expect(vectorDashboards.map(d => d.title)).toEqual([
      'Vector Stack Overview',
      'Vector Processing Metrics',
      'Vector Error Tracking'
    ])
  })

  it('should handle dashboard updates without restart', async () => {
    // Given: Existing dashboard
    const initialDashboard = await grafanaClient.getDashboard('vector-stack-overview')
    
    // When: Dashboard configuration changes
    const updatedConfig = { ...initialDashboard, refresh: '5s' }
    await provisioningService.updateDashboard('vector-stack-overview', updatedConfig)
    
    // Then: Dashboard should update without service restart
    const updatedDashboard = await grafanaClient.getDashboard('vector-stack-overview')
    expect(updatedDashboard.refresh).toBe('5s')
    expect(updatedDashboard.version).toBeGreaterThan(initialDashboard.version)
  })

  it('should validate dashboard JSON structure', async () => {
    // Given: Invalid dashboard JSON
    const invalidDashboard = { title: 'Invalid', panels: 'not-an-array' }
    
    // When/Then: Should throw validation error
    await expect(provisioningService.provisionDashboard(invalidDashboard))
      .rejects.toThrow('Invalid dashboard structure: panels must be an array')
  })
})
```

### 1.2 Dashboard Data Source Validation
```typescript
describe('DashboardDataSourceValidation', () => {
  it('should connect to Prometheus data source', async () => {
    // Given: Grafana with Prometheus data source
    const dataSources = await grafanaClient.listDataSources()
    const prometheus = dataSources.find(ds => ds.type === 'prometheus')
    
    // Then: Should have valid Prometheus connection
    expect(prometheus).toBeDefined()
    expect(prometheus.url).toBe(process.env.PROMETHEUS_URL || 'http://prometheus:9090')
    
    // And: Should respond to health check
    const health = await grafanaClient.checkDataSourceHealth(prometheus.id)
    expect(health.status).toBe('OK')
  })

  it('should display metrics in dashboard panels', async () => {
    // Given: Dashboard with metrics panels
    const dashboard = await grafanaClient.getDashboard('vector-stack-overview')
    
    // When: Querying panel data
    const panelData = await grafanaClient.queryPanelData(
      dashboard.panels[0],
      'now-1h',
      'now'
    )
    
    // Then: Should return valid metrics
    expect(panelData).toBeDefined()
    expect(panelData.series).toHaveLength(1)
    expect(panelData.series[0].name).toMatch(/vector_.+/)
  })
})
```

## 2. Pushgateway Integration Tests

### 2.1 Metrics Push Validation
```typescript
// tests/observability/pushgateway/metrics_push.test.ts
describe('PushgatewayMetricsPush', () => {
  let pushgatewayClient: PushgatewayClient
  let metricsCollector: MetricsCollector

  beforeEach(async () => {
    pushgatewayClient = new PushgatewayClient({
      url: process.env.PUSHGATEWAY_URL || 'http://localhost:9091',
      jobName: 'rektrace-indexer'
    })
    metricsCollector = new MetricsCollector(pushgatewayClient)
    await pushgatewayClient.clear()
  })

  it('should successfully push counter metrics', async () => {
    // Given: Valid counter metric
    const metric = {
      name: 'indexer_blocks_processed_total',
      value: 42,
      labels: { chain: 'ethereum', network: 'mainnet' }
    }
    
    // When: Pushing metric
    await metricsCollector.push(metric)
    
    // Then: Metric should be available in Pushgateway
    const metrics = await pushgatewayClient.getMetrics()
    expect(metrics).toContain('indexer_blocks_processed_total{chain="ethereum",network="mainnet"} 42')
  })

  it('should handle batch metrics push', async () => {
    // Given: Multiple metrics
    const metrics = [
      { name: 'metric_a', value: 1, labels: {} },
      { name: 'metric_b', value: 2, labels: { type: 'test' } },
      { name: 'metric_c', value: 3.14, labels: { category: 'performance' } }
    ]
    
    // When: Pushing batch
    await metricsCollector.pushBatch(metrics)
    
    // Then: All metrics should be available
    const pushedMetrics = await pushgatewayClient.getMetrics()
    expect(pushedMetrics).toContain('metric_a 1')
    expect(pushedMetrics).toContain('metric_b{type="test"} 2')
    expect(pushedMetrics).toContain('metric_c{category="performance"} 3.14')
  })

  it('should validate metric names and labels', async () => {
    // Given: Invalid metric name
    const invalidMetric = { name: 'invalid-metric-name', value: 1, labels: {} }
    
    // When/Then: Should throw validation error
    await expect(metricsCollector.push(invalidMetric))
      .rejects.toThrow('Invalid metric name: must match regex [a-zA-Z_:][a-zA-Z0-9_:]*')
  })

  it('should handle pushgateway unavailability', async () => {
    // Given: Invalid pushgateway URL
    const invalidClient = new PushgatewayClient({
      url: 'http://invalid:9091',
      jobName: 'test'
    })
    
    // When/Then: Should handle gracefully with retry
    await expect(invalidClient.push({ name: 'test', value: 1, labels: {} }))
      .rejects.toThrow('ECONNREFUSED')
  })
})
```

### 2.2 Metrics Format Validation
```typescript
describe('MetricsFormatValidation', () => {
  it('should format histogram metrics correctly', async () => {
    // Given: Histogram data
    const histogram = {
      name: 'request_duration_seconds',
      buckets: [
        { le: 0.1, value: 10 },
        { le: 0.5, value: 25 },
        { le: 1.0, value: 30 }
      ],
      count: 30,
      sum: 12.5
    }
    
    // When: Formatting for pushgateway
    const formatted = metricsCollector.formatHistogram(histogram)
    
    // Then: Should produce valid Prometheus format
    expect(formatted).toContain('request_duration_seconds_bucket{le="0.1"} 10')
    expect(formatted).toContain('request_duration_seconds_bucket{le="0.5"} 25')
    expect(formatted).toContain('request_duration_seconds_count 30')
    expect(formatted).toContain('request_duration_seconds_sum 12.5')
  })
})
```

## 3. Prometheus Scrape Configuration Tests

### 3.1 Target Discovery
```typescript
// tests/observability/prometheus/scrape_config.test.ts
describe('PrometheusScrapeConfiguration', () => {
  let prometheusClient: PrometheusClient

  beforeEach(() => {
    prometheusClient = new PrometheusClient({
      url: process.env.PROMETHEUS_URL || 'http://localhost:9090'
    })
  })

  it('should discover pushgateway target', async () => {
    // Given: Prometheus with updated config
    await prometheusClient.reloadConfig()
    
    // When: Checking active targets
    const targets = await prometheusClient.getTargets()
    
    // Then: Should include pushgateway
    const pushgatewayTarget = targets.find(t => 
      t.labels.job === 'pushgateway' && 
      t.labels.instance === 'pushgateway:9091'
    )
    expect(pushgatewayTarget).toBeDefined()
    expect(pushgatewayTarget.health).toBe('up')
  })

  it('should scrape vector metrics endpoint', async () => {
    // Given: Vector service running
    const vectorTarget = await prometheusClient.getTarget('vector:8686')
    
    // Then: Should be healthy and scraping
    expect(vectorTarget).toBeDefined()
    expect(vectorTarget.health).toBe('up')
    expect(vectorTarget.lastScrape).toBeDefined()
  })

  it('should validate scrape interval configuration', async () => {
    // Given: Prometheus configuration
    const config = await prometheusClient.getConfiguration()
    
    // Then: Should have correct scrape intervals
    const vectorConfig = config.scrape_configs.find(c => c.job_name === 'vector')
    expect(vectorConfig.scrape_interval).toBe('5s')
    
    const indexerConfig = config.scrape_configs.find(c => c.job_name === 'rektrace-indexer')
    expect(indexerConfig.scrape_interval).toBe('10s')
  })
})
```

### 3.2 Metrics Query Validation
```typescript
describe('PrometheusMetricsQuery', () => {
  it('should return vector events rate', async () => {
    // Given: Vector is processing events
    await simulateVectorProcessing()
    
    // When: Querying metrics
    const result = await prometheusClient.query('rate(vector_events_total[5m])')
    
    // Then: Should return valid rate
    expect(result).toBeDefined()
    expect(result.data.result).toHaveLength(1)
    expect(parseFloat(result.data.result[0].value[1])).toBeGreaterThan(0)
  })

  it('should handle missing metrics gracefully', async () => {
    // When: Querying non-existent metric
    const result = await prometheusClient.query('non_existent_metric')
    
    // Then: Should return empty result
    expect(result.data.result).toHaveLength(0)
  })
})
```

## 4. Indexer Metrics Emission Tests

### 4.1 Counter Metrics
```typescript
// tests/observability/indexer/metrics_emission.test.ts
describe('IndexerMetricsEmission', () => {
  let indexer: IndexerService
  let metricsCollector: IndexerMetricsCollector

  beforeEach(() => {
    metricsCollector = new IndexerMetricsCollector()
    indexer = new IndexerService(metricsCollector)
  })

  it('should emit block processing counter', async () => {
    // Given: Initial metric value
    const initialBlocks = await getMetricValue('indexer_blocks_processed_total')
    
    // When: Processing a block
    await indexer.processBlock({
      height: 12345,
      hash: '0x123...',
      transactions: []
    })
    
    // Then: Counter should increment
    const updatedBlocks = await getMetricValue('indexer_blocks_processed_total')
    expect(updatedBlocks).toBe(initialBlocks + 1)
  })

  it('should emit processing duration histogram', async () => {
    // Given: Block processing starts
    const startTime = Date.now()
    
    // When: Processing completes
    await indexer.processBlock(testBlock)
    const duration = Date.now() - startTime
    
    // Then: Should emit duration metric
    const histogram = await getHistogramMetrics('indexer_processing_duration_seconds')
    expect(histogram.count).toBeGreaterThan(0)
    expect(histogram.sum).toBeCloseTo(duration / 1000, 1)
  })

  it('should emit error counter on processing failure', async () => {
    // Given: Initial error count
    const initialErrors = await getMetricValue('indexer_processing_errors_total')
    
    // When: Processing fails
    await indexer.simulateProcessingError(new Error('Test error'))
    
    // Then: Error counter should increment
    const updatedErrors = await getMetricValue('indexer_processing_errors_total')
    expect(updatedErrors).toBe(initialErrors + 1)
  })

  it('should emit queue depth gauge', async () => {
    // Given: Queue with items
    await indexer.addToQueue([testBlock1, testBlock2, testBlock3])
    
    // When: Checking metrics
    const queueDepth = await getMetricValue('indexer_queue_depth')
    
    // Then: Should reflect queue size
    expect(queueDepth).toBe(3)
  })
})
```

### 4.2 Label Validation
```typescript
describe('MetricsLabelValidation', () => {
  it('should include chain labels in metrics', async () => {
    // When: Processing block for specific chain
    await indexer.processBlock({
      ...testBlock,
      chainId: 'ethereum-mainnet'
    })
    
    // Then: Metrics should have chain label
    const metrics = await queryMetrics('indexer_blocks_processed_total{chain="ethereum-mainnet"}')
    expect(metrics).toHaveLength(1)
  })

  it('should validate label values', async () => {
    // Given: Invalid chain ID
    const invalidBlock = { ...testBlock, chainId: 'invalid/chain' }
    
    // When/Then: Should sanitize label values
    await expect(indexer.processBlock(invalidBlock))
      .rejects.toThrow('Invalid label value for chain: must match regex [a-zA-Z0-9_-]+')
  })
})
```

## 5. Integration Tests

### 5.1 End-to-End Metrics Flow
```typescript
// tests/observability/integration/metrics_flow.test.ts
describe('EndToEndMetricsFlow', () => {
  let indexer: IndexerService
  let grafanaClient: GrafanaClient
  let prometheusClient: PrometheusClient

  beforeEach(async () => {
    // Setup all services
    indexer = new IndexerService()
    grafanaClient = new GrafanaClient()
    prometheusClient = new PrometheusClient()
    
    // Ensure clean state
    await clearAllMetrics()
  })

  it('should complete full metrics pipeline', async () => {
    // Given: All services running
    await waitForServices(['prometheus', 'grafana', 'pushgateway'])
    
    // When: Processing blocks
    await indexer.processBlocks([
      { height: 1000, chainId: 'ethereum' },
      { height: 1001, chainId: 'ethereum' },
      { height: 1002, chainId: 'ethereum' }
    ])
    
    // Then: Metrics should be available in Prometheus
    await waitForMetric('indexer_blocks_processed_total', 3)
    
    // And: Dashboard should display metrics
    const dashboardData = await grafanaClient.getDashboardData('vector-stack-overview')
    expect(dashboardData.panels[0].targets[0].data).toBeDefined()
    
    // And: Pushgateway should have metrics
    const pushgatewayMetrics = await getPushgatewayMetrics()
    expect(pushgatewayMetrics).toContain('indexer_blocks_processed_total')
  })
})
```

## 6. Performance Tests

### 6.1 Metrics Volume Testing
```typescript
describe('MetricsPerformance', () => {
  it('should handle high-volume metrics emission', async () => {
    // Given: High load scenario
    const blocks = Array.from({ length: 1000 }, (_, i) => ({
      height: i + 1,
      chainId: 'ethereum'
    }))
    
    // When: Processing all blocks
    const startTime = Date.now()
    await Promise.all(blocks.map(block => indexer.processBlock(block)))
    const duration = Date.now() - startTime
    
    // Then: Should complete within acceptable time
    expect(duration).toBeLessThan(5000) // 5 seconds
    
    // And: All metrics should be recorded
    const totalBlocks = await getMetricValue('indexer_blocks_processed_total')
    expect(totalBlocks).toBe(1000)
  })
})
```

## 7. Security Tests

### 7.1 Configuration Security
```typescript
describe('ConfigurationSecurity', () => {
  it('should not contain hard-coded secrets', async () => {
    // Given: All configuration files
    const configFiles = [
      'docker-compose.yml',
      'prometheus/prometheus.yml',
      'observability/grafana/provisioning/datasources/datasource.yml'
    ]
    
    // When: Scanning for secrets
    const secrets = await scanForSecrets(configFiles)
    
    // Then: Should not find any hard-coded secrets
    expect(secrets).toHaveLength(0)
  })

  it('should use environment variables for sensitive data', async () => {
    // Given: Configuration service
    const config = new ObservabilityConfig()
    
    // Then: Should read from environment
    expect(config.grafanaAdminPassword).toBe(process.env.GRAFANA_ADMIN_PASSWORD)
    expect(config.prometheusUrl).toBe(process.env.PROMETHEUS_URL)
  })
})
```

## 8. Evidence Collection Tests

### 8.1 Acceptance Criteria Validation
```typescript
describe('AcceptanceCriteriaEvidence', () => {
  let evidenceCollector: EvidenceCollector

  beforeEach(() => {
    evidenceCollector = new EvidenceCollector()
  })

  it('should collect dashboard provisioning evidence', async () => {
    // When: Collecting evidence
    const evidence = await evidenceCollector.collectDashboardEvidence()
    
    // Then: Should include required elements
    expect(evidence.type).toBe('dashboard')
    expect(evidence.screenshot).toBeDefined()
    expect(evidence.metrics).toBeDefined()
    expect(evidence.timestamp).toBeDefined()
  })

  it('should collect metrics availability evidence', async () => {
    // When: Collecting metrics evidence
    const evidence = await evidenceCollector.collectMetricsEvidence()
    
    // Then: Should include Prometheus query results
    expect(evidence.type).toBe('metrics')
    expect(evidence.data).toBeDefined()
    expect(evidence.query).toBeDefined()
  })

  it('should generate compliance report', async () => {
    // When: Generating final report
    const report = await evidenceCollector.generateComplianceReport()
    
    // Then: Should include all acceptance criteria
    expect(report.criteria).toContain('Grafana dashboard provisioning')
    expect(report.criteria).toContain('Pushgateway integration')
    expect(report.criteria).toContain('Prometheus scrape configuration')
    expect(report.criteria).toContain('Indexer metrics emission')
    expect(report.criteria).toContain('No hard-coded secrets')
  })
})
```

## Test Execution Order
1. **Unit Tests**: Individual component validation
2. **Integration Tests**: Service interaction validation
3. **Performance Tests**: Load and volume testing
4. **Security Tests**: Configuration and secret validation
5. **Evidence Collection**: Acceptance criteria documentation

## Test Data Requirements
- Mock blockchain data for indexer testing
- Simulated vector events for metrics testing
- Test dashboards for provisioning validation
- Sample metrics for format validation

## Environment Setup
```bash
# Required test environment variables
export GRAFANA_URL=http://localhost:3000
export GRAFANA_USERNAME=admin
export GRAFANA_PASSWORD=grafana
export PROMETHEUS_URL=http://localhost:9090
export PUSHGATEWAY_URL=http://localhost:9091
export TEST_TIMEOUT=30000