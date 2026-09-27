import { beforeEach, describe, expect, it } from "bun:test";
import { context, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { bullmqTelemetry } from "./bullmqTelemetry";
import { testSpans } from "./test/spans";

// BullMQ writes a failed job's `err.message` onto its `process` span (a `job failed` event and
// `recordException`). Nodemailer messages quote recipient addresses, so the adapter keeps event
// names and job IDs only, and records an exception as its `error.type`.

beforeEach(() => testSpans.reset());

const spanThrough = (fn: (span: ReturnType<typeof start>) => void) => {
  const span = start();
  fn(span);
  span.end();
  return testSpans.getFinishedSpans()[0];
};
const start = () =>
  bullmqTelemetry().tracer.startSpan(
    "process email",
    { kind: SpanKind.CONSUMER },
    context.active(),
  );

describe("bullmqTelemetry", () => {
  it("drops every event attribute but the job ID", () => {
    const span = spanThrough((s) => {
      s.addEvent("job failed", { "bullmq.job.failed.reason": "rejected: <a@example.com>" });
      s.addEvent("job completed", { "bullmq.job.result": '"a@example.com"' });
      s.addEvent("job stalled", { "bullmq.job.id": "7" });
    });

    expect(span.events.map((e) => [e.name, e.attributes])).toEqual([
      ["job failed", {}],
      ["job completed", {}],
      ["job stalled", { "bullmq.job.id": "7" }],
    ]);
  });

  it("records an exception as its error type and an error status, never its message or stack", () => {
    const error = Object.assign(new Error("rejected: <a@example.com>"), { code: "EENVELOPE" });
    const span = spanThrough((s) => s.recordException(error));

    expect(span.events).toEqual([]);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes).toEqual({ "error.type": "EENVELOPE" });
  });

  it("keeps BullMQ's own span attributes", () => {
    const span = spanThrough((s) => s.setAttributes({ "bullmq.job.name": "2fa-otp" }));
    expect(span.attributes).toEqual({ "bullmq.job.name": "2fa-otp" });
  });
});
