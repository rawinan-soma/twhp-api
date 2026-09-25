import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { SpanKind } from "@opentelemetry/api";
import { Queue } from "bullmq";
import { testSpans } from "../test/spans";
import { emailQueue } from "./email";

// Until BullMQ's own telemetry lands (issue 06), enqueueing gets a hand-written CLIENT span. The job
// payload carries email addresses, so the span names the queue and job only. Redis is not touched:
// BullMQ's `add` is stubbed.

beforeEach(() => testSpans.reset());

describe("emailQueue.add", () => {
  it("is one CLIENT span naming the queue and job, never the payload", async () => {
    const add = spyOn(Queue.prototype, "add").mockResolvedValue({ id: "1" } as never);

    await emailQueue.add("verdict-result-finished", { to: ["someone@example.com"] });

    expect(add).toHaveBeenCalledTimes(1);
    add.mockRestore();
    const [span] = testSpans.getFinishedSpans();
    expect(span.name).toBe("email add");
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.attributes).toEqual({
      "messaging.system": "bullmq",
      "messaging.destination.name": "email",
      "messaging.operation.name": "add",
      "bullmq.job.name": "verdict-result-finished",
    });
  });
});
