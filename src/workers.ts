import "./worker/email";
import { emailQueue } from "./queue/email";

// Register daily repeatable job: 8:30 AM Bangkok Time (UTC+7) = 01:30 UTC
await emailQueue.add(
  "factory-validation-reminder",
  {},
  {
    repeat: { pattern: "30 1 * * *" },
    jobId: "factory-validation-reminder",
  }
);

console.log("Workers running....");
