import { collectDefaultMetrics, Registry } from "prom-client";

export type ServiceName = "twhp-api" | "twhp-worker";

/**
 * A private registry per process, not prom-client's global `register` — sharing that singleton
 * across the API and worker modules (or across bun:test files, which share a module cache) would
 * throw on the second `collectDefaultMetrics`/metric registration.
 */
export const createRegistry = (service: ServiceName): Registry => {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });
  return registry;
};

/**
 * `GET /metrics` on its own `Bun.serve` listener — never a route under `/twhp/api`, so nginx can
 * never proxy it, and never published by Compose (see ADR-0014).
 */
export const startMetricsServer = (port: number, registry: Registry) =>
  Bun.serve({
    port,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== "/metrics") {
        return new Response("Not found", { status: 404 });
      }
      return new Response(await registry.metrics(), {
        headers: { "content-type": registry.contentType },
      });
    },
  });
