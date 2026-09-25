import { describe, expect, it } from "bun:test";
import { trace } from "@opentelemetry/api";
import { createLogger, logMixin, scrubErrorMessage, toBangkokIso } from "./logger";

const ISO_BANGKOK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+07:00$/;

const capture = () => {
  const raw: string[] = [];
  return {
    raw,
    stream: { write: (line: string) => raw.push(line) },
    lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
};

describe("toBangkokIso", () => {
  it("renders ISO 8601 with the +07:00 offset and milliseconds", () => {
    expect(toBangkokIso(new Date("2026-09-25T07:30:05.123Z"))).toBe(
      "2026-09-25T14:30:05.123+07:00",
    );
  });

  it("rolls the date over at Bangkok midnight", () => {
    expect(toBangkokIso(new Date("2026-09-30T17:00:00.000Z"))).toBe(
      "2026-10-01T00:00:00.000+07:00",
    );
  });
});

describe("scrubErrorMessage", () => {
  it("drops the bound params Drizzle appends to a failed query", () => {
    const message =
      'Failed query: insert into "accounts" ("email") values ($1)\nparams: someone@example.com';
    expect(scrubErrorMessage(message)).toBe(
      'Failed query: insert into "accounts" ("email") values ($1)',
    );
  });

  it("leaves other messages alone", () => {
    expect(scrubErrorMessage("boom")).toBe("boom");
  });
});

describe("createLogger", () => {
  it("stamps time as Bangkok ISO and tags the service", () => {
    const sink = capture();
    createLogger("twhp-worker", { stream: sink.stream }).info("hello");

    const [line] = sink.lines();
    expect(line.time).toMatch(ISO_BANGKOK);
    expect(line.service).toBe("twhp-worker");
    expect(line.msg).toBe("hello");
  });

  it("redacts secrets and personal fields at any depth", () => {
    const sink = capture();
    createLogger("twhp-worker", { stream: sink.stream }).info({
      email: "a@example.com",
      job: {
        data: { to: "b@example.com", cc: ["c@example.com"], bcc: "d@example.com", otp: "123456" },
        auth: { password: "pw", token: "tkn" },
      },
      headers: { authorization: "Bearer x", cookie: "Authentication=y", "set-cookie": "Refresh=z" },
      nested: { a: { b: { c: { email: "deep@example.com" } } } },
      list: [{ email: "e@example.com" }],
    });

    const [raw] = sink.raw;
    for (const secret of ["@", "123456", '"pw"', "tkn", "Bearer", "Authentication=", "Refresh="]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("serializes a logged request to method and path only", () => {
    const sink = capture();
    const request = new Request("http://api.local/twhp/api/file/presigned?fileName=secret", {
      headers: { cookie: "Authentication=cookie-value", "user-agent": "curl/8.0" },
    });
    createLogger("twhp-api", { stream: sink.stream }).error({ status: 404, request }, "Not found");

    const [line] = sink.lines();
    expect(line.request).toEqual({ method: "GET", path: "/twhp/api/file/presigned" });
  });
});

describe("logMixin", () => {
  it("is empty outside a span", () => {
    expect(logMixin()).toEqual({});
  });

  it("carries the active span's trace_id and span_id", () => {
    trace.getTracer("test").startActiveSpan("unit", (span) => {
      const { traceId, spanId } = span.spanContext();
      expect(logMixin()).toEqual({ trace_id: traceId, span_id: spanId });
      span.end();
    });
  });
});
