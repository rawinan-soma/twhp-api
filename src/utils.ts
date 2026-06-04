import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import * as Minio from "minio";
import { env } from "./config";

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
  uploadFile,
  deleteFile,
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
