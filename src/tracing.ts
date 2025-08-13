import { NodeSDK } from '@opentelemetry/sdk-node';
import { trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

export async function setupTracing(serviceName: string): Promise<() => Promise<void>> {
  const jaegerEndpoint = process.env.JAEGER_ENDPOINT || 'http://127.0.0.1:4318/v1/traces';
  if (!process.env.OTEL_SERVICE_NAME) {
    process.env.OTEL_SERVICE_NAME = serviceName;
  }

  const exporter = new JaegerExporter({ endpoint: jaegerEndpoint });
  const sdk = new NodeSDK({
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();
  try {
    const tracer = trace.getTracer('startup');
    const span = tracer.startSpan(`startup:${serviceName}`);
    span.addEvent('service_start');
    span.end();
  } catch {}
  return async () => {
    await sdk.shutdown().catch(() => {});
  };
}


