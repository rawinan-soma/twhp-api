import { Queue } from "bullmq";
import { withClientSpan } from "../clientSpan";
import { env } from "../config";

/**
 * `add` runs in a CLIENT span naming the queue and job, never the payload (it carries email
 * addresses). Stopgap until BullMQ's own telemetry is switched on (issue 06), which replaces it.
 */
class TracedQueue extends Queue {
  override add(...args: Parameters<Queue["add"]>) {
    return withClientSpan(
      `${this.name} add`,
      {
        "messaging.system": "bullmq",
        "messaging.destination.name": this.name,
        "messaging.operation.name": "add",
        "bullmq.job.name": args[0],
      },
      () => super.add(...args),
    );
  }
}

export const emailQueue = new TracedQueue("email", {
  connection: { host: env.REDIS_HOST, port: env.REDIS_PORT },
});
