import { sql } from "drizzle-orm";
import { status } from "elysia";
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

// `uploadFile` creates the bucket in this region; signing with it skips minio-js's
// GET ?location lookup, which fails with NoSuchBucket before the bucket exists.
const MINIO_REGION = "us-east-1";

/** The one minio-js primitive the probe needs: a signed request that hands back the response. */
type S3RequestClient = {
  makeRequestAsyncOmit(
    options: { method: "HEAD"; bucketName: string },
    payload: string,
    statusCodes: number[],
    region: string,
  ): Promise<{ headers: Record<string, string | string[] | undefined> }>;
};

/**
 * HEAD on the configured bucket. 200 (exists) and 404 (not created yet — the first upload creates
 * it) both count, but only when the answer carries `x-amz-request-id`, which proves an S3 server
 * sent it. A rejected signature (403), any other status, or a non-S3 server is "down".
 */
const headBucket = async ({ client, bucket }: { client: S3RequestClient; bucket: string }) => {
  const response = await client.makeRequestAsyncOmit(
    { method: "HEAD", bucketName: bucket },
    "",
    [200, 404],
    MINIO_REGION,
  );
  return Boolean(response.headers["x-amz-request-id"]);
};

export const createHealthService = (
  database: Pick<typeof db, "execute">,
  // `status` is ioredis's connection state. The shared connector has `maxRetriesPerRequest: null`,
  // so a PING sent while disconnected would sit in its offline queue forever — one per poll.
  redis: { status: string; ping(): Promise<unknown> },
  storage: { client: S3RequestClient; bucket: string },
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
      check(() => headBucket(storage), timeoutMs),
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
