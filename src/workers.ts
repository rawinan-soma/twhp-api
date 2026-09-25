import "./worker/email";
import { env } from "./config";
import { createLogger } from "./logger";
import { startMetricsServer } from "./metrics";
import { emailQueue } from "./queue/email";
import { emailWorker } from "./worker/email";
import { createEmailQueueGauges, wireEmailJobMetrics, workerRegistry } from "./worker/metrics";

wireEmailJobMetrics(emailWorker);
createEmailQueueGauges(emailQueue);
startMetricsServer(env.METRICS_PORT, workerRegistry);

// Register daily repeatable job: 8:30 AM Bangkok Time (server local time UTC+7)
await emailQueue.add(
  "factory-validation-reminder",
  {},
  {
    repeat: { pattern: "30 8 * * *" },
    jobId: "factory-validation-reminder",
    removeOnComplete: true,
    removeOnFail: { count: 10 },
  },
);

createLogger("twhp-worker").info("Workers running");
