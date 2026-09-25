import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { Histogram, Registry } from "prom-client";
import type { ReadinessChecks } from "../schema/health";
import { createDependencyUpGauge, createHttpMetrics } from "./metrics";

// `onAfterResponse` runs after the response is handed back, so give it a tick to record.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const freshHistogram = () => {
  const registry = new Registry();
  const histogram = new Histogram({
    name: "http_server_request_duration_seconds",
    help: "test",
    labelNames: ["method", "route", "status_class"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  return histogram;
};

// A hook only applies to routes defined after it in the same instance (see requestLogging in
// src/logging.ts), so the plugin is mounted before routes here too.
const buildApp = (histogram: Histogram<string>) =>
  new Elysia({ prefix: "/twhp/api" })
    .use(createHttpMetrics(histogram))
    .get("/health/live", () => "ok")
    .get("/factories/:id", ({ params }) => params.id);

const routeLabels = (values: { labels: Record<string, unknown> }[]) =>
  new Set(values.map((v) => v.labels.route));

describe("http_server_request_duration_seconds", () => {
  it("labels by route template, not raw path — one label value survives two different ids", async () => {
    const histogram = freshHistogram();
    const app = buildApp(histogram);

    await app.handle(new Request("http://api.local/twhp/api/factories/123"));
    await app.handle(new Request("http://api.local/twhp/api/factories/456"));
    await settle();

    const { values } = await histogram.get();
    expect(routeLabels(values)).toEqual(new Set(["/twhp/api/factories/:id"]));
  });

  it("excludes /health* from duration recording", async () => {
    const histogram = freshHistogram();
    const app = buildApp(histogram);

    await app.handle(new Request("http://api.local/twhp/api/health/live"));
    await settle();

    const { values } = await histogram.get();
    expect(values).toHaveLength(0);
  });

  it('labels an unmatched route as "unmatched", never the raw path', async () => {
    const histogram = freshHistogram();
    const app = buildApp(histogram);

    await app.handle(new Request("http://api.local/twhp/api/does/not/exist"));
    await settle();

    const { values } = await histogram.get();
    expect(routeLabels(values)).toEqual(new Set(["unmatched"]));
    expect(values.every((v) => v.labels.status_class === "4xx")).toBe(true);
  });

  it("records status_class 2xx for a successful request", async () => {
    const histogram = freshHistogram();
    const app = buildApp(histogram);

    await app.handle(new Request("http://api.local/twhp/api/factories/1"));
    await settle();

    const { values } = await histogram.get();
    expect(values.every((v) => v.labels.status_class === "2xx")).toBe(true);
  });
});

describe("twhp_dependency_up", () => {
  const fakeHealth = (checks: ReadinessChecks) => ({
    checkReadiness: async () => checks,
  });

  it("reports 1/0 per dependency from an injected readiness check", async () => {
    const registry = new Registry();
    const gauge = createDependencyUpGauge(
      fakeHealth({ postgres: "up", redis: "down", minio: "up" }),
      registry,
    );

    const { values } = await gauge.get();
    const byDependency = Object.fromEntries(values.map((v) => [v.labels.dependency, v.value]));
    expect(byDependency).toEqual({ postgres: 1, redis: 0, minio: 1 });
  });

  it("caches checkReadiness across concurrent scrapes", async () => {
    let calls = 0;
    const registry = new Registry();
    const gauge = createDependencyUpGauge(
      {
        checkReadiness: async () => {
          calls++;
          return { postgres: "up", redis: "up", minio: "up" } as ReadinessChecks;
        },
      },
      registry,
    );

    await Promise.all([gauge.get(), gauge.get()]);
    expect(calls).toBe(1);
  });
});
