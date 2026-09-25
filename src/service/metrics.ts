import { Elysia } from "elysia";
import { Gauge, Histogram } from "prom-client";
import { pathOf } from "../logger";
import { createRegistry } from "../metrics";
import { isHealthPath } from "../routes";
import type { ReadinessChecks } from "../schema/health";
import { type HealthService, healthService } from "./health";

export const apiRegistry = createRegistry("twhp-api");

export const httpRequestDuration = new Histogram({
  name: "http_server_request_duration_seconds",
  help: "HTTP server request duration in seconds, by method, route template and status class.",
  labelNames: ["method", "route", "status_class"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [apiRegistry],
});

const READINESS_CACHE_MS = 10_000;

/** Caches (and dedupes concurrent scrapes of) `checkReadiness()` for up to 10 s. */
const cachedReadinessOf = (health: Pick<HealthService, "checkReadiness">) => {
  let cached: { at: number; checks: Promise<ReadinessChecks> } | undefined;
  return () => {
    const now = Date.now();
    if (!cached || now - cached.at >= READINESS_CACHE_MS) {
      cached = { at: now, checks: health.checkReadiness() };
    }
    return cached.checks;
  };
};

const DEPENDENCIES = ["postgres", "redis", "minio"] as const;

/** Builds the `twhp_dependency_up` gauge against a given health service, for injection in tests. */
export const createDependencyUpGauge = (
  health: Pick<HealthService, "checkReadiness">,
  registry = apiRegistry,
) => {
  const getReadiness = cachedReadinessOf(health);
  return new Gauge({
    name: "twhp_dependency_up",
    help: "Whether a dependency reported healthy at the last readiness check, 1 (up) or 0 (down).",
    labelNames: ["dependency"],
    registers: [registry],
    async collect() {
      const checks = await getReadiness();
      for (const dependency of DEPENDENCIES) {
        this.set({ dependency }, checks[dependency] === "up" ? 1 : 0);
      }
    },
  });
};

export const dependencyUp = createDependencyUpGauge(healthService);

type MetricsStore = { metricsStart?: number };

/**
 * Records `http_server_request_duration_seconds` by route template, never the raw path.
 * `/health*` is excluded, and an unmatched route is labeled `"unmatched"` so 404 scans can't
 * explode cardinality. Must be mounted before route registration — an Elysia hook only applies to
 * routes defined after it in the same instance (see `requestLogging` in src/logging.ts).
 */
export const createHttpMetrics = (histogram = httpRequestDuration) =>
  new Elysia()
    .onRequest(({ store }) => {
      (store as MetricsStore).metricsStart = performance.now();
    })
    .onAfterResponse(({ request, route, set, store }) => {
      const path = pathOf(request);
      if (isHealthPath(path)) return;
      const start = (store as MetricsStore).metricsStart;
      const seconds = start === undefined ? 0 : (performance.now() - start) / 1000;
      const responseStatus = typeof set.status === "number" ? set.status : 200;
      histogram.observe(
        {
          method: request.method,
          route: route ?? "unmatched",
          status_class: `${Math.floor(responseStatus / 100)}xx`,
        },
        seconds,
      );
    })
    .as("global");

export const httpMetrics = createHttpMetrics();
