import { Counter, Gauge, type Registry } from "prom-client";
import { createRegistry } from "../metrics";
import { EMAIL_JOB_NAMES } from "./email.jobNames";

export const workerRegistry = createRegistry("twhp-worker");

export const createEmailJobsTotal = (registry = workerRegistry) =>
  new Counter({
    name: "twhp_email_jobs_total",
    help: "Email jobs processed by the worker, by job name and outcome.",
    labelNames: ["job_name", "outcome"],
    registers: [registry],
  });

export const emailJobsTotal = createEmailJobsTotal();

/** The one BullMQ `Worker` surface this module needs — a fake in tests only needs to match this. */
type EmailWorkerLike = {
  on(event: "completed", listener: (job: { name: string }) => void): unknown;
  on(event: "failed", listener: (job: { name: string } | undefined, error: Error) => void): unknown;
};

const EMAIL_JOB_OUTCOMES = ["completed", "failed"] as const;

/**
 * Increments `twhp_email_jobs_total` from the worker's own `completed`/`failed` events. First
 * pre-registers every known job name (plus the `failed`-only "unknown" fallback) at 0 for both
 * outcomes: a prom-client counter emits no series at all until its first `.inc()`, so without this
 * a job's first-ever failure appears to Prometheus as a series born already at 1, with no earlier
 * sample to diff against — `increase()` reports 0 and the "Email jobs failing" alert misses it.
 */
export const wireEmailJobMetrics = (worker: EmailWorkerLike, counter = emailJobsTotal) => {
  for (const job_name of EMAIL_JOB_NAMES) {
    for (const outcome of EMAIL_JOB_OUTCOMES) counter.inc({ job_name, outcome }, 0);
  }
  counter.inc({ job_name: "unknown", outcome: "failed" }, 0);

  worker.on("completed", (job) => {
    counter.inc({ job_name: job.name, outcome: "completed" });
  });
  worker.on("failed", (job, _error) => {
    counter.inc({ job_name: job?.name ?? "unknown", outcome: "failed" });
  });
};

const QUEUE_STATES = ["waiting", "active", "delayed", "failed"] as const;

/** The one BullMQ `Queue` surface this module needs — a fake in tests only needs to match this. */
type EmailQueueLike = {
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  getWaiting(start: number, end: number): Promise<{ timestamp: number }[]>;
};

export const createEmailQueueGauges = (
  queue: EmailQueueLike,
  registry: Registry = workerRegistry,
) => {
  const queueJobs = new Gauge({
    name: "twhp_email_queue_jobs",
    help: "Current BullMQ email queue depth, by state.",
    labelNames: ["state"],
    registers: [registry],
    async collect() {
      const counts = await queue.getJobCounts(...QUEUE_STATES);
      for (const state of QUEUE_STATES) this.set({ state }, counts[state] ?? 0);
    },
  });

  const oldestWaitingSeconds = new Gauge({
    name: "twhp_email_queue_oldest_waiting_seconds",
    help: "Age in seconds of the oldest waiting email job, 0 when none.",
    registers: [registry],
    async collect() {
      // `getWaiting(0, 0)` returns jobs in ascending (oldest-first) order, so a single-element
      // window is the oldest waiting job — see BullMQ's getRanges Lua script.
      const [oldest] = await queue.getWaiting(0, 0);
      this.set(oldest ? (Date.now() - oldest.timestamp) / 1000 : 0);
    },
  });

  return { queueJobs, oldestWaitingSeconds };
};
