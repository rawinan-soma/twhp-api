import { env } from "./config";
import { startTelemetry } from "./telemetry";

// The worker's telemetry bootstrap. `src/workers.ts` imports it first — not `--preload`, which a
// `bun build --compile` binary cannot take — so the provider and W3C propagator are registered
// before BullMQ carries a job's trace context in (ADR-0014). No `pg` spans in the binary.
startTelemetry({
  service: "twhp-worker",
  environment: env.DEPLOYMENT_ENV,
  endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
