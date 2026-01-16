import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
  // Default url is http://localhost:4318/v1/traces
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://localhost:4318/v1/traces',
});

const metricReader = new PrometheusExporter({
  port: 9464, // Default port for Prometheus exporter
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'twhp-api-auth',
  }),
  traceExporter,
  metricReader,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
