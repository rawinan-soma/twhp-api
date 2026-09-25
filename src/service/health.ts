import { sql } from "drizzle-orm";
import { status } from "elysia";
import type { Client as MinioClient } from "minio";
import { env } from "../config";
import { db } from "../drizzle";
import type { CheckStatus, ReadinessChecks } from "../schema/health";
import { minioClient, redisConnector } from "../utils";

/** Resolves "up" if `probe` settles truthy within `timeoutMs`; any error, falsy result or timeout is "down". */
const check = async (probe: () => Promise<unknown>, timeoutMs: number): Promise<CheckStatus> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return (await Promise.race([probe(), timeout])) ? "up" : "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
};

export const createHealthService = (
  database: Pick<typeof db, "execute">,
  // `status` is ioredis's connection state. The shared connector has `maxRetriesPerRequest: null`,
  // so a PING sent while disconnected would sit in its offline queue forever — one per poll.
  redis: { status: string; ping(): Promise<unknown> },
  storage: { client: Pick<MinioClient, "bucketExists">; bucket: string },
  timeoutMs = 1000,
) => {
  /** Probes PostgreSQL, Redis and MinIO in parallel, each bounded by `timeoutMs`. */
  const checkReadiness = async (): Promise<ReadinessChecks> => {
    const [postgres, redisCheck, minio] = await Promise.all([
      check(() => database.execute(sql`select 1`).then(() => true), timeoutMs),
      check(
        async () => redis.status === "ready" && (await redis.ping().then(() => true)),
        timeoutMs,
      ),
      // Any answer is "up": the first upload creates the bucket, so a fresh deployment has none.
      check(() => storage.client.bucketExists(storage.bucket).then(() => true), timeoutMs),
    ]);
    return { postgres, redis: redisCheck, minio };
  };

  return {
    checkReadiness,
    /** 200 when every dependency is up, otherwise 503 with the same body. */
    getReadiness: async () => {
      const checks = await checkReadiness();
      return Object.values(checks).every((c) => c === "up")
        ? ({ status: "ready", checks } as const)
        : status(503, { status: "not_ready", checks } as const);
    },
  };
};

export type HealthService = ReturnType<typeof createHealthService>;

export const healthService = createHealthService(db, redisConnector, {
  client: minioClient,
  bucket: env.MINIO_BUCKET_NAME,
});
