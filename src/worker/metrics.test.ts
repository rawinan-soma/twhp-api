import { describe, expect, it } from "bun:test";
import { Registry } from "prom-client";
import { createEmailJobsTotal, createEmailQueueGauges, wireEmailJobMetrics } from "./metrics";

// A minimal stand-in for BullMQ's `Worker`: real `.on("completed"|"failed", ...)` listeners,
// fired manually the way BullMQ fires them after the processor settles.
class FakeWorker {
  private handlers: Record<string, ((...args: never[]) => void)[]> = {};
  on(event: string, handler: (...args: never[]) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers[event] ?? []) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }
}

describe("wireEmailJobMetrics", () => {
  it("increments twhp_email_jobs_total{outcome=completed} on a completed job", async () => {
    const registry = new Registry();
    const counter = createEmailJobsTotal(registry);
    const worker = new FakeWorker();
    wireEmailJobMetrics(worker, counter);

    worker.emit("completed", { name: "2fa-otp" });

    const { values } = await counter.get();
    expect(values).toEqual([
      expect.objectContaining({ labels: { job_name: "2fa-otp", outcome: "completed" }, value: 1 }),
    ]);
  });

  it('increments twhp_email_jobs_total{outcome="failed"} after a forced SMTP failure', async () => {
    const registry = new Registry();
    const counter = createEmailJobsTotal(registry);
    const worker = new FakeWorker();
    wireEmailJobMetrics(worker, counter);

    const smtpError = Object.assign(new Error("Recipient address rejected"), {
      code: "EENVELOPE",
      responseCode: 550,
    });
    worker.emit("failed", { name: "verdict-result-finished" }, smtpError);

    const { values } = await counter.get();
    expect(values).toEqual([
      expect.objectContaining({
        labels: { job_name: "verdict-result-finished", outcome: "failed" },
        value: 1,
      }),
    ]);
  });

  it('labels a failure with no job as job_name="unknown"', async () => {
    const registry = new Registry();
    const counter = createEmailJobsTotal(registry);
    const worker = new FakeWorker();
    wireEmailJobMetrics(worker, counter);

    worker.emit("failed", undefined, new Error("stalled"));

    const { values } = await counter.get();
    expect(values).toEqual([
      expect.objectContaining({ labels: { job_name: "unknown", outcome: "failed" }, value: 1 }),
    ]);
  });
});

describe("createEmailQueueGauges", () => {
  it("twhp_email_queue_jobs reflects getJobCounts by state", async () => {
    const registry = new Registry();
    const fakeQueue = {
      getJobCounts: async () => ({ waiting: 3, active: 1, delayed: 0, failed: 2 }),
      getWaiting: async () => [],
    };
    const { queueJobs } = createEmailQueueGauges(fakeQueue, registry);

    const { values } = await queueJobs.get();
    const byState = Object.fromEntries(values.map((v) => [v.labels.state, v.value]));
    expect(byState).toEqual({ waiting: 3, active: 1, delayed: 0, failed: 2 });
  });

  it("twhp_email_queue_oldest_waiting_seconds is 0 when the queue is empty", async () => {
    const registry = new Registry();
    const fakeQueue = {
      getJobCounts: async () => ({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
      getWaiting: async () => [],
    };
    const { oldestWaitingSeconds } = createEmailQueueGauges(fakeQueue, registry);

    const { values } = await oldestWaitingSeconds.get();
    expect(values[0]?.value).toBe(0);
  });

  it("twhp_email_queue_oldest_waiting_seconds reports the oldest waiting job's age", async () => {
    const registry = new Registry();
    const oldTimestamp = Date.now() - 45_000;
    const fakeQueue = {
      getJobCounts: async () => ({ waiting: 1, active: 0, delayed: 0, failed: 0 }),
      getWaiting: async () => [{ timestamp: oldTimestamp }],
    };
    const { oldestWaitingSeconds } = createEmailQueueGauges(fakeQueue, registry);

    const { values } = await oldestWaitingSeconds.get();
    expect(values[0]?.value).toBeGreaterThanOrEqual(44);
    expect(values[0]?.value).toBeLessThan(60);
  });
});
