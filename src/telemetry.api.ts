import { env } from "./config";
import { startTelemetry } from "./telemetry";

// The API's telemetry bootstrap. Every API command preloads it — `bun --preload
// ./src/telemetry.api.ts src/index.ts` — so `pg` is patched before Drizzle imports it (ADR-0014).
// Not a `bunfig.toml` preload: that would also run in the worker, `db:push` and `db:seed`.
startTelemetry({
  service: "twhp-api",
  environment: env.DEPLOYMENT_ENV,
  endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
