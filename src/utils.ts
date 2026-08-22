import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import * as Minio from "minio";
import { env } from "./config";
import { FISCAL_YEAR_MAX, FISCAL_YEAR_MIN } from "./schema/fiscal-year";

const minioClient = new Minio.Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

const uploadFile = async (file: File): Promise<string> => {
  const ext = file.name.split(".").pop();
  const fileName = `${randomUUID()}.${ext}`;
  const bucketName = env.MINIO_BUCKET_NAME;

  const exists = await minioClient.bucketExists(bucketName);
  if (!exists) {
    await minioClient.makeBucket(bucketName, "us-east-1");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  await minioClient.putObject(bucketName, fileName, buffer, buffer.length, {
    "Content-Type": file.type,
  });

  return fileName;
};

const deleteFile = async (fileName: string | null) => {
  if (!fileName) return;

  try {
    await minioClient.removeObject(env.MINIO_BUCKET_NAME, fileName);
  } catch (error) {
    console.error(`Failed to delete file from MinIO: ${fileName}`, error);
  }
};

/**
 * Strict delete: propagates MinIO failures instead of swallowing them, so a caller can
 * abort before committing dependent DB work. Used by evaluator finalize, where a failed
 * hard-reject delete must surface *before* the cover transition (no partial finalize).
 */
const deleteFileStrict = async (fileName: string | null) => {
  if (!fileName) return;
  await minioClient.removeObject(env.MINIO_BUCKET_NAME, fileName);
};

/**
 * Thailand has been UTC+7 since 1920 and has never observed DST.
 *
 * Pinned here so the fiscal-year boundary does not depend on the host's TZ. This matters more than
 * it looks: no fiscal-year value is persisted anywhere, so every historical read re-derives its own
 * boundary through this file. Measured before pinning, the old host-local implementation produced
 * boundaries 7-11 hours apart across TZ=UTC, America/New_York, and Pacific/Kiritimati, and was
 * correct only because the API containers set TZ=Asia/Bangkok while PostgreSQL runs on UTC.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The instant of 1 October 00:00 Bangkok time in year `y`. */
const fiscalYearBoundary = (y: number) => new Date(Date.UTC(y, 9, 1) - BANGKOK_OFFSET_MS);

/**
 * The Common Era fiscal year whose window contains `instant`.
 *
 * A fiscal year is labelled by its ENDING year: FY2026 runs 2025-10-01 to 2026-09-30.
 */
const getFiscalYearOf = (instant: Date) => {
  const bangkok = new Date(instant.getTime() + BANGKOK_OFFSET_MS);
  // getUTCMonth() is 0-based; 9 is October.
  return bangkok.getUTCMonth() >= 9 ? bangkok.getUTCFullYear() + 1 : bangkok.getUTCFullYear();
};

/**
 * Days after the rollover boundary during which a Factory may still complete a prior-year Cover.
 *
 * Declared here, and only here. A window duplicated across the four Factory write paths would let a
 * Factory be admitted by one path and refused by the next — losing its work at the last step.
 *
 * Lives in this module rather than `src/schema/fiscal-year.ts` because it needs the resolver below,
 * and that module is already imported *by* this one; the reverse direction would be circular.
 */
export const GRACE_DAYS = 31;

/**
 * Whether Factory grace admits a write to `targetYear` at `now`.
 *
 * Expressed relative to the rollover boundary, so it means "31 days after rollover" in every fiscal
 * year — not the literal dates of 2026, which would silently stop applying later with no failing
 * test. Only the immediately preceding fiscal year is ever admitted.
 */
export const factoryGraceApplies = (targetYear: number, now: Date = new Date()) => {
  const currentYear = getFiscalYearOf(now);
  if (targetYear !== currentYear - 1) return false;

  const graceEnds = fiscalYearBoundary(currentYear - 1).getTime() + GRACE_DAYS * 86_400_000;
  return now.getTime() < graceEnds;
};

export const utilities = () => ({
  /**
   * Resolves the half-open window [Oct 1 of Y-1, Oct 1 of Y) for a Common Era fiscal year.
   *
   * Omit `fiscalYear` for the current one — this is what all existing callers do, and their
   * behaviour is unchanged. Reads the clock exactly once; the previous implementation read it
   * twice and could straddle midnight on 1 October.
   */
  getFiscalYear: (fiscalYear?: number) => {
    const year = fiscalYear ?? getFiscalYearOf(new Date());

    if (!Number.isInteger(year) || year < FISCAL_YEAR_MIN || year > FISCAL_YEAR_MAX) {
      throw new RangeError(
        `fiscalYear must be an integer between ${FISCAL_YEAR_MIN} and ${FISCAL_YEAR_MAX}, got: ${fiscalYear}`,
      );
    }

    return {
      // Additive: existing callers destructure only the two boundaries. `fiscalYear` is the
      // resolved Common Era year, so a caller that needs to echo it back never re-derives it.
      fiscalYear: year,
      fiscalYearStart: fiscalYearBoundary(year - 1),
      fiscalYearEnd: fiscalYearBoundary(year),
    };
  },
  getFiscalYearOf,
  factoryGraceApplies,
  createRedisConnector: () => {
    const redisConnector = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      maxRetriesPerRequest: null,
    });

    return redisConnector;
  },
  uploadFile,
  deleteFile,
  deleteFileStrict,
  getPresignedUrl: async (fileName: string) => {
    const internalUrl = await minioClient.presignedGetObject(env.MINIO_BUCKET_NAME, fileName, 5, {
      "response-content-disposition": "inline",
    });
    // Replace internal Docker hostname with public-facing URL
    const internal = new URL(internalUrl);
    const publicBase = new URL(env.MINIO_PUBLIC_URL);
    internal.protocol = publicBase.protocol;
    internal.hostname = publicBase.hostname;
    internal.port = "";
    internal.pathname =
      publicBase.pathname + internal.pathname.replace(`/${env.MINIO_BUCKET_NAME}`, "");
    return internal.toString();
  },
});

export const redisConnector = utilities().createRedisConnector();
