import Redis from "ioredis";
import { env } from "./config";

export const utilities = () => ({
  getFiscalYear: () => {
    const currentYear = new Date().getFullYear();
    const now = new Date();
    const fiscalYearStart =
      now >= new Date(currentYear, 9, 1)
        ? new Date(currentYear, 9, 1)
        : new Date(currentYear - 1, 9, 1);
    const fiscalYearEnd = new Date(fiscalYearStart.getFullYear() + 1, 9, 1);

    return { fiscalYearStart, fiscalYearEnd };
  },
  createRedisConnector: () => {
    const redisConnector = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      maxRetriesPerRequest: null,
    });

    return redisConnector;
  },
});

export const redisConnector = utilities().createRedisConnector();
