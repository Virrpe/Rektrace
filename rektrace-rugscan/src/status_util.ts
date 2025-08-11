import { breakers } from '../../src/providers.js';
import { getProviderMetrics } from '../../src/metrics.js';

export function buildStatusBody(): string {
  const lines = Object.entries(breakers).map(([k, b]) => `- ${k}: ${b.state()} (last transition: ${Math.round((Date.now()-b.lastTransitionAt())/1000)}s ago)`);
  const pm = getProviderMetrics();
  const pSummary = Object.entries(pm).map(([name, s]) => `  • ${name}: ✔️ ${s.success} ❌ ${s.fail} ⌀ ${s.avgLatencyMs}ms p50=${s.p50??'—'} p90=${s.p90??'—'} err%=${s.errorPct??0}`).join('\n');
  const budgets = [
    `timeouts: ${Number(process.env.PROVIDER_TIMEOUT_MS ?? 2500)}ms, retries: ${Number(process.env.PROVIDER_RETRY ?? 1)}`,
    `scan_ttl: ${Number(process.env.SCAN_TTL_SECONDS ?? 120)}s, lp_ttl: ${Number(process.env.LP_TTL_SECONDS ?? 600)}s`,
  ];
  const gates = [
    process.env.MAINTENANCE_MODE === 'true' ? 'maintenance: ON' : null,
    process.env.BREAKER_FORCE_OPEN === 'true' ? 'breaker_force_open: ON' : null,
    process.env.READONLY_MODE === 'true' ? 'read_only: ON' : null,
  ].filter(Boolean);
  const gateBlock = gates.length ? ['*Gates*', ...gates].join('\n') : '';
  return ['*Status*', ...lines, '', '*Budgets*', ...budgets, '', '*Providers*', pSummary || '  • none', gateBlock ? `\n${gateBlock}` : ''].filter(Boolean).join('\n');
}


