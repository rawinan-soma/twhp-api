import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { SpanKind } from "@opentelemetry/api";
import { Queue } from "bullmq";
import { testSpans } from "../test/spans";
import { emailQueue } from "./email";

// Enqueueing is BullMQ's own PRODUCER span (`bullmq-otel`). The job payload carries email addresses,
// so the span must name the queue and job only. Redis is not touched: BullMQ's `addJob`, the
// telemetry-free half of `add`, is stubbed. Propagation into the worker is covered by
// `src/worker/tracing.redis.test.ts`.

beforeEach(() => testSpans.reset());

describe("emailQueue.add", () => {
  it("is one PRODUCER span naming the queue and job, never the payload", async () => {
    // `addJob` is protected, hence the cast.
    const addJob = spyOn(
      Queue.prototype as unknown as { addJob: Queue["add"] },
      "addJob",
    ).mockResolvedValue({ id: "1" } as never);

    await emailQueue.add("verdict-result-finished", { to: ["someone@example.com"] });

    expect(addJob).toHaveBeenCalledTimes(1);
    const opts = addJob.mock.calls[0][2];
    addJob.mockRestore();
    const [span] = testSpans.getFinishedSpans();
    expect(span.name).toBe("add email.verdict-result-finished");
    expect(span.kind).toBe(SpanKind.PRODUCER);
    expect(span.attributes).toEqual({
      "bullmq.queue.name": "email",
      "bullmq.queue.operation": "add",
      "bullmq.job.name": "verdict-result-finished",
      "bullmq.job.id": "1",
    });
    // The trace context the worker continues from.
    expect(JSON.parse(opts?.telemetry?.metadata ?? "{}").traceparent).toContain(
      span.spanContext().traceId,
    );
  });
});
