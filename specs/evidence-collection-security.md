# Evidence Collection & Security Requirements

## Evidence Collection Framework

### 1. Automated Evidence Collection

#### 1.1 Evidence Collector Service
```typescript
// src/observability/evidence/EvidenceCollector.ts
interface EvidenceCollector {
  collectDashboardEvidence(): Promise<DashboardEvidence>
  collectMetricsEvidence(): Promise<MetricsEvidence>
  collectIntegrationEvidence(): Promise<IntegrationEvidence>
  generateComplianceReport(): Promise<ComplianceReport>
}

interface Evidence {
  type: string
  timestamp: string
  data: any
  screenshot?: string
  validation: ValidationResult
}

class ObservabilityEvidenceCollector implements EvidenceCollector {
  async collectDashboardEvidence(): Promise<DashboardEvidence> {
    const evidence = {
      type: 'grafana-dashboard',
      timestamp: new Date().toISOString(),
      data: {
        dashboards: await this.getAllDashboards(),
        provisioning: await this.validateProvisioning(),
        dataSources: await this.validateDataSources()
      },
      screenshot: await this.captureDashboardScreenshot(),
      validation: await this.validateDashboardFunctionality()
    }
    
    await this.saveEvidence(evidence)
    return evidence
  }

  async collectMetricsEvidence(): Promise<MetricsEvidence> {
    return {
      type: 'prometheus-metrics',
      timestamp: new Date().toISOString(),
      data: {
        targets: await this.getPrometheusTargets(),
        metrics: await this.queryKeyMetrics(),
        alerts: await this.validateAlertRules()
      },
      validation: await this.validateMetricsPipeline()
    }
  }
}
```

#### 1.2 Evidence Storage
```typescript
// src/observability/evidence/EvidenceStorage.ts
class EvidenceStorage {
  private readonly storagePath: string
  
  constructor(storagePath: string = './evidence') {
    this.storagePath = storagePath
    this.ensureStorageDirectory()
  }

  async saveEvidence(evidence: Evidence): Promise<string> {
    const filename = `${evidence.type}-${evidence.timestamp}.json`
    const filepath = path.join(this.storagePath, filename)
    
    await fs.writeFile(filepath, JSON.stringify(evidence, null, 2))
    return filepath
  }

  async generateComplianceReport(): Promise<ComplianceReport> {
    const evidences = await this.collectAllEvidences()
    
    return {
      timestamp: new Date().toISOString(),
      criteria: [
        {
          criterion: 'Grafana dashboard auto-provisioning',
          status: this.validateDashboardProvisioning(evidences),
          evidence: evidences.find(e => e.type === 'grafana-dashboard')
        },
        {
          criterion: 'Pushgateway integration',
          status: this.validatePushgatewayIntegration(evidences),
          evidence: evidences.find(e => e.type === 'pushgateway-metrics')
        },
        {
          criterion: 'Prometheus scrape configuration',
          status: this.validatePrometheusConfig(evidences),
          evidence: evidences.find(e => e.type === 'prometheus-scrape')
        },
        {
          criterion: 'Indexer metrics emission',
          status: this.validateIndexerMetrics(evidences),
          evidence: evidences.find(e => e.type === 'indexer-metrics')
        },
        {
          criterion: 'No hard-coded secrets',
          status: this.validateSecurity(evidences),
          evidence: evidences.find(e => e.type === 'security-audit')
        }
      ],
      overall: this.calculateOverallCompliance(evidences)
    }
  }
}
```

### 2. Security Configuration & Validation

#### 2.1 Secret Detection & Validation
```typescript
// src/observability/security/SecretValidator.ts
class SecretValidator {
  private readonly secretPatterns = [
    /password\s*=\s*["'][^"']+["']/i,
    /api[_-]?key\s*=\s*["'][^"']+["']/i,
    /secret\s*=\s*["'][^"']+["']/i,
    /token\s*=\s*["'][^"']+["']/i,
    /private[_-]?key\s*=\s*["'][^"']+["']/i
  ]

  async scanForSecrets(filePaths: string[]): Promise<SecretScanResult> {
    const findings: SecretFinding[] = []
    
    for (const filePath of filePaths) {
      const content = await fs.readFile(filePath, 'utf8')
      const lines = content.split('\n')
      
      lines.forEach((line, index) => {
        this.secretPatterns.forEach(pattern => {
          const match = line.match(pattern)
          if (match) {
            findings.push({
              file: filePath,
              line: index + 1,
              pattern: match[0],
              type: this.classifySecret(match[0])
            })
          }
        })
      })
    }
    
    return {
      scannedFiles: filePaths.length,
      findings,
      passed: findings.length === 0
    }
  }

  private classifySecret(match: string): string {
    if (match.includes('password')) return 'password'
    if (match.includes('key')) return 'api-key'
    if (match.includes('token')) return 'token'
    return 'secret'
  }
}
```

#### 2.2 Environment Variable Validation
```typescript
// src/observability/security/EnvironmentValidator.ts
class EnvironmentValidator {
  private readonly requiredVars = [
    'GRAFANA_ADMIN_PASSWORD',
    'PROMETHEUS_URL',
    'PUSHGATEWAY_URL'
  ]

  async validateEnvironment(): Promise<EnvironmentValidation> {
    const missing = this.requiredVars.filter(v => !process.env[v])
    const hardcoded = await this.findHardcodedValues()
    
    return {
      missingVariables: missing,
      hardcodedSecrets: hardcoded,
      passed: missing.length === 0 && hardcoded.length === 0,
      recommendations: this.generateRecommendations(missing, hardcoded)
    }
  }

  private async findHardcodedValues(): Promise<string[]> {
    const configFiles = [
      'docker-compose.yml',
      'prometheus/prometheus.yml',
      'observability/grafana/provisioning/datasources/datasource.yml'
    ]
    
    const hardcoded = []
    
    for (const file of configFiles) {
      const content = await fs.readFile(file, 'utf8')
      
      // Check for hard-coded credentials
      if (content.includes('password: ') && !content.includes('${')) {
        hardcoded.push(`${file}: hard-coded password detected`)
      }
      
      if (content.includes('basic_auth:') && content.includes('password:')) {
        hardcoded.push(`${file}: hard-coded basic auth password`)
      }
    }
    
    return hardcoded
  }
}
```

### 3. Configuration Security Patterns

#### 3.1 Environment Variable Configuration
```yaml
# docker-compose.yml (secure version)
services:
  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
    volumes:
      - ./observability/grafana/provisioning:/etc/grafana/provisioning:ro
```

#### 3.2 Configuration Template
```typescript
// src/config/ObservabilityConfig.ts
interface ObservabilityConfig {
  grafana: GrafanaConfig
  prometheus: PrometheusConfig
  pushgateway: PushgatewayConfig
}

interface GrafanaConfig {
  url: string
  adminPassword: string
  provisioningPath: string
}

class SecureObservabilityConfig implements ObservabilityConfig {
  static fromEnv(): SecureObservabilityConfig {
    return {
      grafana: {
        url: process.env.GRAFANA_URL || 'http://localhost:3000',
        adminPassword: process.env.GRAFANA_ADMIN_PASSWORD!,
        provisioningPath: process.env.GRAFANA_PROVISIONING_PATH || './observability/grafana/provisioning'
      },
      prometheus: {
        url: process.env.PROMETHEUS_URL || 'http://localhost:9090',
        configPath: process.env.PROMETHEUS_CONFIG_PATH || './prometheus/prometheus.yml'
      },
      pushgateway: {
        url: process.env.PUSHGATEWAY_URL || 'http://localhost:9091',
        jobName: process.env.PUSHGATEWAY_JOB_NAME || 'rektrace-indexer'
      }
    }
  }

  validate(): ValidationResult {
    const errors = []
    
    if (!this.grafana.adminPassword) {
      errors.push('GRAFANA_ADMIN_PASSWORD environment variable is required')
    }
    
    if (!this.prometheus.url) {
      errors.push('PROMETHEUS_URL environment variable is required')
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
}
```

### 4. Evidence Collection Checklist

#### 4.1 Pre-deployment Checklist
- [ ] Run secret scan on all configuration files
- [ ] Validate all environment variables are properly configured
- [ ] Ensure no hard-coded credentials in any files
- [ ] Verify all sensitive data uses environment variables
- [ ] Test configuration loading with missing variables

#### 4.2 Runtime Evidence Collection
```typescript
// src/observability/evidence/RuntimeEvidence.ts
class RuntimeEvidenceCollector {
  async collectRuntimeEvidence(): Promise<RuntimeEvidence> {
    return {
      timestamp: new Date().toISOString(),
      services: {
        grafana: await this.checkGrafanaHealth(),
        prometheus: await this.checkPrometheusHealth(),
        pushgateway: await this.checkPushgatewayHealth()
      },
      metrics: {
        totalMetrics: await this.getTotalMetricsCount(),
        activeAlerts: await this.getActiveAlerts(),
        scrapeTargets: await this.getScrapeTargets()
      },
      security: {
        secretsScan: await this.runSecretsScan(),
        envValidation: await this.validateEnvironment()
      }
    }
  }

  private async checkGrafanaHealth(): Promise<ServiceHealth> {
    try {
      const response = await fetch(`${process.env.GRAFANA_URL}/api/health`)
      return {
        service: 'grafana',
        status: response.ok ? 'healthy' : 'unhealthy',
        responseTime: Date.now()
      }
    } catch (error) {
      return {
        service: 'grafana',
        status: 'unhealthy',
        error: error.message
      }
    }
  }
}
```

### 5. Compliance Report Generation

#### 5.1 Report Structure
```typescript
interface ComplianceReport {
  timestamp: string
  version: string
  environment: string
  criteria: ComplianceCriterion[]
  security: SecurityReport
  evidence: EvidenceCollection
  summary: {
    total: number
    passed: number
    failed: number
    warnings: number
  }
}

interface ComplianceCriterion {
  id: string
  description: string
  status: 'passed' | 'failed' | 'warning'
  evidence: Evidence
  remediation?: string
}
```

#### 5.2 Automated Report Generation
```bash
#!/bin/bash
# scripts/generate-compliance-report.sh

echo "Generating observability compliance report..."

# Run evidence collection
node dist/observability/evidence/generate-report.js

# Run security scan
node dist/observability/security/scan-secrets.js

# Validate environment
node dist/observability/security/validate-env.js

# Generate final report
node dist/observability/evidence/compliance-report.js

echo "Report generated: evidence/compliance-report-$(date +%Y%m%d-%H%M%S).json"
```

### 6. Evidence Storage Structure
```
evidence/
├── 2024-01-15/
│   ├── grafana-dashboard-evidence.json
│   ├── prometheus-metrics-evidence.json
│   ├── security-scan-results.json
│   └── compliance-report.json
├── screenshots/
│   ├── grafana-dashboard-overview.png
│   ├── prometheus-targets.png
│   └── pushgateway-metrics.png
└── reports/
    ├── daily-compliance-report.json
    └── security-audit-report.json
```

### 7. Validation Commands

#### 7.1 Security Validation
```bash
# Check for hard-coded secrets
grep -r "password.*=" . --exclude-dir=.git --exclude-dir=node_modules

# Validate environment variables
node -e "require('./dist/config/validate-env.js').validate()"

# Run secret scanner
node dist/security/secret-scanner.js
```

#### 7.2 Evidence Collection Commands
```bash
# Collect all evidence
npm run evidence:collect

# Generate compliance report
npm run evidence:report

# Validate security
npm run security:validate
```

### 8. Acceptance Criteria Validation

#### 8.1 Automated Validation Script
```typescript
// scripts/validate-acceptance-criteria.ts
async function validateAcceptanceCriteria(): Promise<ValidationResult> {
  const validations = await Promise.all([
    validateDashboardProvisioning(),
    validatePushgatewayIntegration(),
    validatePrometheusScrapeConfig(),
    validateIndexerMetrics(),
    validateSecurityConfiguration()
  ])
  
  return {
    passed: validations.every(v => v.passed),
    results: validations,
    report: await generateDetailedReport(validations)
  }
}
```

This completes the evidence collection and security requirements for the vector stack observability specification.