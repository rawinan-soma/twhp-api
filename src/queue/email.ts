import { Queue } from "bullmq";
import { bullmqTelemetry } from "../bullmqTelemetry";
import { env } from "../config";

/**
 * BullMQ's own telemetry: `add` is a PRODUCER span, and the active trace context rides in the job's
 * options so the worker's `process` span joins the request's trace. The worker uses the same option
 * (`src/worker/email.ts`). Span attributes name the queue, job name and job ID, never the payload.
 */
export const emailQueue = new Queue("email", {
  connection: { host: env.REDIS_HOST, port: env.REDIS_PORT },
  telemetry: bullmqTelemetry(),
});
