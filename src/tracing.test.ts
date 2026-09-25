import { beforeEach, describe, expect, it } from "bun:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Elysia, status, t } from "elysia";
import { Client } from "pg";
import { logMixin } from "./logger";
import { createLogging } from "./logging";
import { createHealthRoutes } from "./routes";
import { createHealthService } from "./service/health";
import { testSpans } from "./test/spans";
import { requestTracing } from "./tracing";

// The request-span plugin `src/index.ts` mounts before autoload, over the provider the test preload
// registers exactly as the API preload does (pg patched, spans kept in memory, nothing exported).

// A Client whose connection is refused still runs `query` through the patched driver, so a route
// "hits the DB" and gets its pg span without a database.
const unreachableDb = () => {
  const client = new Client("postgresql://user:pass@127.0.0.1:1/twhp");
  client.connect().catch(() => {});
  return drizzle({ client });
};

const down = async () => {
  throw new Error("down");
};

const buildApp = () => {
  const lines: Record<string, unknown>[] = [];
  const { requestLogging } = createLogging(
    { write: (line: string) => lines.push(JSON.parse(line)) },
    logMixin,
  );
  const health = createHealthService(
    // biome-ignore lint/suspicious/noExplicitAny: the fake exposes only the `execute` the probe calls
    { execute: down } as any,
    { status: "ready", ping: down },
    { client: { makeRequestAsyncOmit: down }, bucket: "twhp" },
  );
  const app = new Elysia({ prefix: "/twhp/api" })
    .use(requestTracing)
    .use(requestLogging)
    .use(createHealthRoutes(health))
    .get("/factories/:id", async ({ params }) => {
      await unreachableDb()
        .execute(sql`select ${params.id}`)
        .catch(() => {});
      return { id: params.id };
    })
    .get("/file/presigned", ({ query }) => query.fileName, {
      query: t.Object({ fileName: t.String() }),
    })
    .get("/count", ({ query }) => query.n, { query: t.Object({ n: t.Numeric() }) })
    .get("/boom", () => {
      throw new Error("Failed query: select 1\nparams: someone@example.com");
    })
    .group("/me", (group) =>
      group
        .derive(({ headers }) =>
          headers.authorization === "Bearer ok"
            ? { jwtPayload: { sub: "42" } }
            : status(401, { message: "unauthorized" }),
        )
        .get("/", ({ jwtPayload }) => jwtPayload.sub),
    );
  return { app, lines };
};

const get = (app: { handle(r: Request): Promise<Response> }, path: string, headers = {}) =>
  app.handle(new Request(`http://api.local${path}`, { headers }));

// The span ends and the request line is written in `onAfterResponse`, after the response returns.
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const serverSpans = () =>
  testSpans.getFinishedSpans().filter((span) => span.kind === SpanKind.SERVER);

const HEX32 = /^[0-9a-f]{32}$/;

beforeEach(() => testSpans.reset());

describe("request span", () => {
  it("is one SERVER span named by route template, parent of the request's pg span", async () => {
    const response = await get(buildApp().app, "/twhp/api/factories/7");
    await settle();

    expect(response.status).toBe(200);
    const [server, ...others] = serverSpans();
    expect(others).toEqual([]);
    expect(server.name).toBe("GET /twhp/api/factories/:id");
    expect(server.parentSpanContext).toBeUndefined();
    expect(server.attributes).toEqual({
      "http.request.method": "GET",
      "url.path": "/twhp/api/factories/7",
      "http.route": "/twhp/api/factories/:id",
      "http.response.status_code": 200,
    });

    const pg = testSpans.getFinishedSpans().filter((span) => span.name.startsWith("pg.query"));
    expect(pg).toHaveLength(1);
    expect(pg[0].spanContext().traceId).toBe(server.spanContext().traceId);
    expect(pg[0].parentSpanContext?.spanId).toBe(server.spanContext().spanId);
    expect(pg[0].attributes["db.query.text"]).toBe("select $1");
    expect(JSON.stringify(pg[0].attributes)).not.toContain('"7"');
  });

  it("sets enduser.id when the request is authenticated", async () => {
    await get(buildApp().app, "/twhp/api/me", { authorization: "Bearer ok" });
    await settle();

    expect(serverSpans()[0].attributes["enduser.id"]).toBe("42");
  });

  it("carries no header, cookie, query string or user-agent in any span", async () => {
    const response = await get(buildApp().app, "/twhp/api/file/presigned?fileName=secret", {
      cookie: "Authentication=abc; Refresh=def",
      authorization: "Bearer xyz",
      "user-agent": "curl/8.7.1-probe",
    });
    await settle();

    expect(response.status).toBe(200);
    const spans = testSpans.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    const exported = JSON.stringify(
      spans.map((span: ReadableSpan) => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
        resource: span.resource.attributes,
      })),
    );
    for (const leak of ["abc", "def", "xyz", "secret", "curl/8.7.1-probe"])
      expect(exported).not.toContain(leak);
  });

  it("ignores an inbound traceparent and starts a new trace", async () => {
    const sentTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const response = await get(buildApp().app, "/twhp/api/factories/7", {
      traceparent: `00-${sentTraceId}-00f067aa0ba902b7-01`,
    });
    await settle();

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(HEX32);
    expect(requestId).not.toBe(sentTraceId);
    expect(serverSpans()[0].parentSpanContext).toBeUndefined();
  });

  it("is an error with the exception recorded, scrubbed of bound params, on an unexpected 500", async () => {
    const response = await get(buildApp().app, "/twhp/api/boom");
    await settle();

    expect(response.status).toBe(500);
    const [server] = serverSpans();
    expect(server.name).toBe("GET /twhp/api/boom");
    expect(server.status.code).toBe(SpanStatusCode.ERROR);
    expect(server.attributes["http.response.status_code"]).toBe(500);
    const [exception] = server.events;
    expect(exception.name).toBe("exception");
    expect(exception.attributes?.["exception.message"]).toBe("Failed query: select 1");
    expect(JSON.stringify(server.events)).not.toContain("@");
  });

  it("is not an error on a 4xx", async () => {
    await get(buildApp().app, "/twhp/api/count?n=x");
    await settle();

    const [server] = serverSpans();
    expect(server.status.code).toBe(SpanStatusCode.UNSET);
    expect(server.events).toEqual([]);
  });

  it.each([
    "/twhp/api/health",
    "/twhp/api/health/live",
    "/twhp/api/health/ready",
  ])("is not created for %s", async (path) => {
    await get(buildApp().app, path);
    await settle();

    expect(testSpans.getFinishedSpans()).toEqual([]);
  });
});

describe("X-Request-Id", () => {
  it.each([
    ["/twhp/api/factories/7", 200],
    ["/twhp/api/count?n=x", 400],
    ["/twhp/api/me", 401],
    ["/twhp/api/nope", 404],
    ["/twhp/api/boom", 500],
  ])("is the trace ID on %s (%i), and matches the request's log line", async (path, expected) => {
    const { app, lines } = buildApp();
    const response = await get(app, path);
    await settle();

    expect(response.status).toBe(expected);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(HEX32);
    expect(serverSpans()[0].spanContext().traceId).toBe(requestId as string);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.trace_id).toBe(requestId);
      expect(line.span_id).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("differs between requests", async () => {
    const { app } = buildApp();
    const first = await get(app, "/twhp/api/factories/1");
    const second = await get(app, "/twhp/api/factories/1");
    expect(first.headers.get("x-request-id")).not.toBe(second.headers.get("x-request-id"));
  });
});
