// First: registers the tracer provider and W3C propagator before BullMQ or anything else loads.
import "./telemetry.worker";
import { env } from "./config";
import { createLogger } from "./logger";
import { startMetricsServer } from "./metrics";
import { emailQueue } from "./queue/email";
import { createEmailWorker, scheduleValidationReminder } from "./worker/email";
import { createEmailQueueGauges, wireEmailJobMetrics, workerRegistry } from "./worker/metrics";

const emailWorker = createEmailWorker();
wireEmailJobMetrics(emailWorker);
createEmailQueueGauges(emailQueue);
startMetricsServer(env.METRICS_PORT, workerRegistry);

await scheduleValidationReminder(emailQueue);

createLogger("twhp-worker").info("Workers running");
