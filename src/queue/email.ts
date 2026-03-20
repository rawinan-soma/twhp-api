import { Queue } from "bullmq";
import { env } from "../config";

export const emailQueue = new Queue("email", {
  connection: { host: env.REDIS_HOST, port: env.REDIS_PORT },
});
