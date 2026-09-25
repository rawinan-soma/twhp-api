import { describe, expect, it } from "bun:test";
import { Elysia, status } from "elysia";
import { createLogging } from "./logging";
import { createHealthRoutes } from "./routes";
import { createHealthService } from "./service/health";

// Proves the request-logging plugin `src/index.ts` mounts writes the light request line and keeps
// health routes out of the logs — including the 503 from /health/ready, which the 4xx/5xx
// `onAfterResponse` hook would otherwise record. Log lines are captured from the pino stream instead of stdout.

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
    { client: { makeRequestAsyncOmit: down }, bucket: "twhp" },
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

const ISO_BANGKOK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+07:00$/;

const capture = () => {
  const raw: string[] = [];
  return {
    raw,
    stream: { write: (line: string) => raw.push(line) },
    lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
};

const buildApp = (sink: ReturnType<typeof capture>, mixin?: () => Record<string, unknown>) =>
  new Elysia({ prefix: "/twhp/api" })
    .use(createLogging(sink.stream, mixin).requestLogging)
    .get("/health", () => "ok")
    .get("/file/presigned", () => "url")
    .group("/factories", (app) =>
      app
        .derive(() => ({ jwtPayload: { sub: "42", role: "Factory" } }))
        .get("/:id", ({ params }) => ({ id: params.id })),
    );

describe("request line", () => {
  it("writes one light line without query string, cookie or user-agent", async () => {
    const sink = capture();
    const app = buildApp(sink);

    await app.handle(
      new Request("http://api.local/twhp/api/file/presigned?fileName=secret", {
        headers: { cookie: "Authentication=cookie-value", "user-agent": "curl/8.0" },
      }),
    );
    await settle();

    expect(sink.raw).toHaveLength(1);
    const [raw] = sink.raw;
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("cookie-value");
    expect(raw).not.toContain("curl");
    const [line] = sink.lines();
    expect(line.path).toBe("/twhp/api/file/presigned");
    expect(line.method).toBe("GET");
    expect(line.time).toMatch(ISO_BANGKOK);
    expect(line.service).toBe("twhp-api");
  });

  it("writes exactly one line with userId, status, durationMs and route when authenticated", async () => {
    const sink = capture();
    const app = buildApp(sink);

    const response = await app.handle(new Request("http://api.local/twhp/api/factories/7"));
    await settle();

    expect(response.status).toBe(200);
    expect(sink.raw).toHaveLength(1);
    const [line] = sink.lines();
    expect(line).toMatchObject({
      method: "GET",
      path: "/twhp/api/factories/7",
      route: "/twhp/api/factories/:id",
      status: 200,
      userId: "42",
    });
    expect(typeof line.durationMs).toBe("number");
  });

  it("omits userId when the request is anonymous", async () => {
    const sink = capture();
    await buildApp(sink).handle(new Request("http://api.local/twhp/api/file/presigned"));
    await settle();

    expect(sink.lines()[0]).not.toHaveProperty("userId");
  });

  it("keeps mixin fields on the plugin's own request line", async () => {
    const sink = capture();
    await buildApp(sink, () => ({ probe: 1 })).handle(
      new Request("http://api.local/twhp/api/factories/7"),
    );
    await settle();

    expect(sink.lines()[0]).toMatchObject({ probe: 1, route: "/twhp/api/factories/:id" });
  });

  it("does not log /health", async () => {
    const sink = capture();
    await buildApp(sink).handle(new Request("http://api.local/twhp/api/health"));
    await settle();

    expect(sink.raw).toHaveLength(0);
  });
});
