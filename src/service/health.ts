import { sql } from "drizzle-orm";
import type { Client as MinioClient } from "minio";
import { env } from "../config";
import { db } from "../drizzle";
import type { Readiness } from "../schema/health";
import { minioClient, redisConnector } from "../utils";

type CheckStatus = Readiness["checks"]["postgres"];
export type ReadinessChecks = Readiness["checks"];

const HEALTH_PATH = "/twhp/api/health";

/** `/health`, `/health/live` and `/health/ready` — all excluded from request logs. */
export const isHealthPath = (pathname: string) =>
  pathname === HEALTH_PATH || pathname.startsWith(`${HEALTH_PATH}/`);

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
  redis: { ping(): Promise<unknown> },
  minio: Pick<MinioClient, "bucketExists">,
  { bucket, timeoutMs = 1000 }: { bucket: string; timeoutMs?: number },
) => ({
  /** Probes PostgreSQL, Redis and MinIO in parallel, each bounded by `timeoutMs`. */
  checkReadiness: async (): Promise<ReadinessChecks> => {
    const [postgres, redisStatus, minioStatus] = await Promise.all([
      check(() => database.execute(sql`select 1`).then(() => true), timeoutMs),
      check(() => redis.ping().then(() => true), timeoutMs),
      check(() => minio.bucketExists(bucket), timeoutMs),
    ]);
    return { postgres, redis: redisStatus, minio: minioStatus };
  },
});

export type HealthService = ReturnType<typeof createHealthService>;

export const healthService = createHealthService(db, redisConnector, minioClient, {
  bucket: env.MINIO_BUCKET_NAME,
});
