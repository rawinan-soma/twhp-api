import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { SpanKind, trace } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { Queue } from "bullmq";
import { bullmqTelemetry } from "../bullmqTelemetry";
import { env } from "../config";
import { testSpans } from "../test/spans";

// Needs a real, disposable Redis at REDIS_HOST:REDIS_PORT (e.g. `docker run --rm -p 6390:6379
// redis:7-alpine` and REDIS_PORT=6390). Each run uses its own queue name and obliterates it.
// PostgreSQL is never queried. SMTP is stubbed with `spyOn`, not `mock.module`: the module is
// evaluated once per `bun test` process, so a module mock here would lose to (or override)
// `src/worker/email.test.ts`'s when both files run together. Log correlation is asserted there.

const { createEmailWorker, scheduleValidationReminder, transporter } = await import("./email");
const sendMail = spyOn(transporter, "sendMail").mockImplementation(
  async () =>
    ({
      accepted: ["someone@example.com"],
      rejected: [],
      messageId: "<0a1b2c3d@twhp.example.com>",
    }) as never,
);

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };
const queueName = `email-trace-test-${crypto.randomUUID()}`;
const queue = new Queue(queueName, { connection, telemetry: bullmqTelemetry() });
const worker = createEmailWorker(queueName, connection);

afterAll(async () => {
  sendMail.mockRestore();
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
});

beforeEach(() => {
  testSpans.reset();
});

const allAttributeValues = (spans: ReadableSpan[]) =>
  spans.flatMap((span) =>
    [span.attributes, ...span.events.map((e) => e.attributes ?? {})].flatMap((attributes) =>
      Object.values(attributes).map(String),
    ),
  );

// `completed`/`failed` fire before the `process` span ends, so wait for the span itself.
const processSpan = async (jobId: string | undefined) => {
  const find = () =>
    testSpans
      .getFinishedSpans()
      .find((s) => s.name === `process ${queueName}` && s.attributes["bullmq.job.id"] === jobId);
  for (let i = 0; i < 100 && !find(); i++) await Bun.sleep(50);
  return find();
};

describe("worker tracing over BullMQ", () => {
  it("processes a job enqueued inside a span in that span's trace, SMTP span included", async () => {
    const { traceId, jobId } = await trace
      .getTracer("test")
      .startActiveSpan("request", async (span) => {
        const job = await queue.add("2fa-otp", { email: "someone@example.com", code: "123456" });
        span.end();
        return { traceId: span.spanContext().traceId, jobId: job.id };
      });

    const process = await processSpan(jobId);
    const spans = testSpans.getFinishedSpans();
    const smtp = spans.find((s) => s.name === "smtp.send");

    expect(process?.kind).toBe(SpanKind.CONSUMER);
    expect(process?.spanContext().traceId).toBe(traceId);
    expect(smtp?.spanContext().traceId).toBe(traceId);
    expect(smtp?.parentSpanContext?.spanId).toBe(process?.spanContext().spanId);
    expect(smtp?.attributes).toEqual({
      "email.job.name": "2fa-otp",
      "email.recipients.count": 1,
      "email.accepted.count": 1,
      "email.rejected.count": 0,
      "email.message_id": "0a1b2c3d",
    });
    expect(allAttributeValues(spans).filter((v) => v.includes("@"))).toEqual([]);
  });

  it("keeps the SMTP error message, which quotes addresses, off a failed job's spans", async () => {
    sendMail.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Recipient rejected: <someone@example.com>"), {
        code: "EENVELOPE",
      });
    });

    const job = await queue.add("2fa-otp", { email: "someone@example.com", code: "123456" });
    const process = await processSpan(job.id);

    expect(process?.events.map((e) => e.name)).toContain("job failed");
    expect(allAttributeValues(testSpans.getFinishedSpans()).filter((v) => v.includes("@"))).toEqual(
      [],
    );
  });

  it("stores no parent context on the daily reminder, so each run is its own root trace", async () => {
    await trace.getTracer("test").startActiveSpan("startup", async (span) => {
      await scheduleValidationReminder(queue);
      span.end();
    });

    const [job] = await queue.getDelayed();
    expect(job.name).toBe("factory-validation-reminder");
    expect(job.opts.telemetry?.metadata).toBeUndefined();
  });
});
