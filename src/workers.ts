import "./worker/email";
import { emailQueue } from "./queue/email";

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

console.log("Workers running....");
