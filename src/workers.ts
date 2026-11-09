import "./worker/email";
import { emailQueue } from "./queue/email";
import { VALIDATION_REMINDER, VALIDATION_REMINDER_PATTERN } from "./queue/schedule";

// Earlier releases registered this job through `add({ repeat })`, which keeps its own
// repeatable key in Redis. A new pattern does not replace it, so the old daily entry would
// keep firing on weekends. Drop every legacy entry before installing the scheduler.
for (const legacy of await emailQueue.getRepeatableJobs()) {
  if (legacy.name === VALIDATION_REMINDER) {
    await emailQueue.removeRepeatableByKey(legacy.key);
  }
}

await emailQueue.upsertJobScheduler(
  VALIDATION_REMINDER,
  { pattern: VALIDATION_REMINDER_PATTERN },
  {
    name: VALIDATION_REMINDER,
    data: {},
    opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
  },
);

console.log("Workers running....");
