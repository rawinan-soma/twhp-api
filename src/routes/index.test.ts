import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import type { ReadinessChecks } from "../schema/health";
import { createHealthService } from "../service/health";
import { createHealthRoutes, isHealthPath } from "./index";

// No mocks: the route factory takes a health service built from injected fake clients, so these
// tests neither touch real dependencies nor leak a process-global `mock.module`.

const up = {
  postgres: { execute: async () => ({ rows: [{ "?column?": 1 }] }) },
  redis: { status: "ready", ping: async () => "PONG" as unknown },
  minio: { bucketExists: async () => true },
};
const hang = () => new Promise<never>(() => {});

const appWith = (clients: Partial<typeof up>) => {
  const c = { ...up, ...clients };
  // biome-ignore lint/suspicious/noExplicitAny: the fake exposes only the `execute` the probe calls
  const service = createHealthService(c.postgres as any, c.redis, {
    client: c.minio,
    bucket: "twhp",
  });
  return new Elysia({ prefix: "/twhp/api" }).use(createHealthRoutes(service));
};

const get = (app: { handle(r: Request): Promise<Response> }, path: string) =>
  app.handle(new Request(`http://localhost${path}`));

describe("GET /twhp/api/health/ready", () => {
  it("returns 200 with every dependency up", async () => {
    const res = await get(appWith({}), "/twhp/api/health/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ready",
      checks: { postgres: "up", redis: "up", minio: "up" },
    });
  });

  it("returns 503 with only redis down when redis fails", async () => {
    const res = await get(
      appWith({
        redis: {
          status: "ready",
          ping: async () => {
            throw new Error("connect ECONNREFUSED 10.0.0.5:6379");
          },
        },
      }),
      "/twhp/api/health/ready",
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({
      status: "not_ready",
      checks: { postgres: "up", redis: "down", minio: "up" },
    });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });

  it("marks redis down without sending PING while ioredis is disconnected", async () => {
    let pinged = false;
    const res = await get(
      appWith({
        redis: {
          status: "reconnecting",
          ping: async () => {
            pinged = true;
            return "PONG";
          },
        },
      }),
      "/twhp/api/health/ready",
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { checks: ReadinessChecks }).checks.redis).toBe("down");
    expect(pinged).toBe(false);
  });

  // The bucket is created lazily by the first upload (`utilities().uploadFile`), so a fresh
  // deployment has none. Readiness asks whether MinIO answers, not whether anyone has uploaded yet.
  it("counts minio up when it answers that the bucket does not exist yet", async () => {
    const res = await get(
      appWith({ minio: { bucketExists: async () => false } }),
      "/twhp/api/health/ready",
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { checks: ReadinessChecks }).checks.minio).toBe("up");
  });

  it("marks minio down when the bucket-exists call fails", async () => {
    const res = await get(
      appWith({
        minio: {
          bucketExists: async () => {
            throw new Error("S3Error: InvalidAccessKeyId");
          },
        },
      }),
      "/twhp/api/health/ready",
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { checks: ReadinessChecks }).checks).toEqual({
      postgres: "up",
      redis: "up",
      minio: "down",
    });
  });

  it("returns within about 1.5 s when a dependency hangs", async () => {
    const started = performance.now();
    const res = await get(
      appWith({ postgres: { execute: hang }, minio: { bucketExists: hang } }),
      "/twhp/api/health/ready",
    );
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1500);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { checks: ReadinessChecks }).checks).toEqual({
      postgres: "down",
      redis: "up",
      minio: "down",
    });
  });
});

describe("liveness", () => {
  it("GET /twhp/api/health/live returns 200 without touching dependencies", async () => {
    const res = await get(
      appWith({
        postgres: { execute: hang },
        redis: { status: "ready", ping: hang },
        minio: { bucketExists: hang },
      }),
      "/twhp/api/health/live",
    );
    expect(res.status).toBe(200);
  });

  it("GET /twhp/api/health still returns 200 'Ready to work!!'", async () => {
    const res = await get(
      appWith({
        postgres: { execute: hang },
        redis: { status: "ready", ping: hang },
        minio: { bucketExists: hang },
      }),
      "/twhp/api/health",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Ready to work!!");
  });
});

describe("isHealthPath (request-log exclusion)", () => {
  it.each([
    "/twhp/api/health",
    "/twhp/api/health/live",
    "/twhp/api/health/ready",
  ])("excludes %s", (path) => expect(isHealthPath(path)).toBe(true));

  it.each([
    "/twhp/api/healthy",
    "/twhp/api/health/foo",
    "/twhp/api/factories",
    "/health",
  ])("keeps %s", (path) => expect(isHealthPath(path)).toBe(false));
});
