import { describe, expect, it } from "bun:test";
import { Elysia, status } from "elysia";
import { createLogging } from "./logging";
import { createHealthRoutes } from "./routes";
import { createHealthService } from "./service/health";

// Proves the request-logging plugin `src/index.ts` mounts is what keeps health routes out of the
// logs — including the 503 from /health/ready, which the 4xx/5xx `onAfterResponse` hook would
// otherwise record. Log lines are captured from the pino stream instead of stdout.

const down = async () => {
  throw new Error("down");
};

const appWithCapturedLogs = () => {
  const lines: string[] = [];
  const { requestLogging } = createLogging({ write: (line: string) => lines.push(line) });
  const health = createHealthService(
    // biome-ignore lint/suspicious/noExplicitAny: the fake exposes only the `execute` the probe calls
    { execute: down } as any,
    { status: "ready", ping: down },
    { client: { bucketExists: down }, bucket: "twhp" },
  );
  const app = new Elysia({ prefix: "/twhp/api" })
    .use(requestLogging)
    .use(createHealthRoutes(health))
    .get("/ok", () => "ok")
    .get("/rejected", () => status(400, { message: "bad" }));
  return { app, lines };
};

const get = (app: { handle(r: Request): Promise<Response> }, path: string) =>
  app.handle(new Request(`http://localhost${path}`));

// `onAfterResponse` runs after the response is handed back, so give it a tick to write.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("request logging", () => {
  it.each([
    ["/twhp/api/health", 200],
    ["/twhp/api/health/live", 200],
    ["/twhp/api/health/ready", 503],
  ])("writes no log line for %s (%i)", async (path, expected) => {
    const { app, lines } = appWithCapturedLogs();
    expect((await get(app, path)).status).toBe(expected);
    await settle();
    expect(lines).toEqual([]);
  });

  it.each([
    ["/twhp/api/ok", 200],
    ["/twhp/api/rejected", 400],
    ["/twhp/api/health/foo", 404],
  ])("still logs %s (%i)", async (path, expected) => {
    const { app, lines } = appWithCapturedLogs();
    expect((await get(app, path)).status).toBe(expected);
    await settle();
    expect(lines.length).toBeGreaterThan(0);
  });
});
