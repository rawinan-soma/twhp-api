import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import { env } from "./config";
import { createLogging } from "./logging";
import { isTelemetryStarted, startTelemetry } from "./telemetry";
import { requestTracing } from "./tracing";

// Started without `--preload ./src/telemetry.api.ts`: keep request spans, X-Request-Id and log
// correlation, but pg was imported before it could be patched, so there are no DB spans.
const preloaded = isTelemetryStarted();
if (!preloaded) {
  startTelemetry({
    service: "twhp-api",
    environment: env.DEPLOYMENT_ENV,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
}

const { globalLogger, requestLogging } = createLogging();

if (!preloaded) {
  globalLogger.warn("Telemetry was not preloaded; traces will have no PostgreSQL spans.");
}

// Dev OTP bypass is hard-blocked in production (see ADR-4). Warn once if it is configured there.
if (env.DEV_SKIP_OTP && env.COOKIE_SECURE) {
  globalLogger.warn(
    "DEV_SKIP_OTP is enabled but ignored because COOKIE_SECURE=true (production). Staff OTP remains enforced.",
  );
}

const app = new Elysia({ prefix: "/twhp/api" })
  // First, so its hooks cover every route, including the OpenAPI ones.
  .use(requestTracing)
  .use(openapi({ path: "document" }))
  .use(requestLogging)
  .use(
    await autoload({
      dir: "./routes",
      ignore: ["**/*.test.ts", "**/*.spec.ts"],
    }),
  );

export type App = typeof app;

app.listen({ port: env.APP_PORT, maxRequestBodySize: 130 * 1024 * 1024 });

globalLogger.info(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
