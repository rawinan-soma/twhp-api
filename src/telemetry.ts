import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { Service } from "./logger";

/**
 * Tracing bootstrap (ADR-0014). The API runs `startTelemetry` from `src/telemetry.api.ts`, which Bun
 * preloads (`--preload`) before any app module so `pg` is patched before Drizzle loads it. It must not import
 * routes, services or `src/config.ts`: callers pass the settings in.
 *
 * Spans are always created, so trace IDs, `X-Request-Id` and log correlation work without a
 * collector. They are exported only when an OTLP endpoint is configured, in the background: a
 * collector that is down never fails or slows a request, and export errors are swallowed.
 */

export type TelemetryOptions = {
  service: Service;
  environment: string;
  /** OTLP/HTTP base URL, e.g. `http://alloy:4318`; null exports nothing. */
  endpoint: string | null;
  /** Extra processors, for tests. */
  spanProcessors?: SpanProcessor[];
};

export const exportProcessorsFor = (endpoint: string | null): SpanProcessor[] =>
  endpoint
    ? [
        new BatchSpanProcessor(
          new OTLPTraceExporter({ url: `${endpoint.replace(/\/+$/, "")}/v1/traces` }),
        ),
      ]
    : [];

export const createTracerProvider = ({
  service,
  environment,
  endpoint,
  spanProcessors = [],
}: TelemetryOptions) =>
  new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: service,
      "deployment.environment": environment,
    }),
    spanProcessors: [...exportProcessorsFor(endpoint), ...spanProcessors],
  });

/**
 * Registers the provider globally with its defaults, an `AsyncLocalStorageContextManager` and the
 * W3C trace-context propagator (the worker's BullMQ propagation needs the latter), then patches
 * `pg`. Statement text is recorded with placeholders only; bound values never are.
 */
export const startTelemetry = (options: TelemetryOptions) => {
  const provider = createTracerProvider(options);
  provider.register();
  new PgInstrumentation({ enhancedDatabaseReporting: false });
  started = true;
  return provider;
};

let started = false;

/** Whether `startTelemetry` has run in this process, i.e. the preload was applied. */
export const isTelemetryStarted = () => started;
