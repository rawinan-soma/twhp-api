import Redis from "ioredis";
import { env } from "./config";
import * as Minio from "minio";
import { randomUUID } from "crypto";

const minioClient = new Minio.Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

const publicReadPolicy = (bucketName: string) =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucketName}/*`],
      },
    ],
  });

const uploadFile = async (file: File): Promise<string> => {
  const ext = file.name.split(".").pop();
  const fileName = `${randomUUID()}.${ext}`;
  const bucketName = env.MINIO_BUCKET_NAME;

  const exists = await minioClient.bucketExists(bucketName);
  if (!exists) {
    await minioClient.makeBucket(bucketName, "us-east-1");
  }
  await minioClient.setBucketPolicy(bucketName, publicReadPolicy(bucketName));

  const buffer = Buffer.from(await file.arrayBuffer());

  await minioClient.putObject(bucketName, fileName, buffer, buffer.length, {
    "Content-Type": file.type,
  });

  return `${env.MINIO_PUBLIC_URL}/${fileName}`;
};

const deleteFile = async (fileUrl: string | null) => {
  if (!fileUrl) return;

  try {
    const url = new URL(fileUrl);
    const bucketName = env.MINIO_BUCKET_NAME;
    // URL pathname usually starts with /bucketName/, e.g., /twhp-uploads/file.png
    // We need to extract just the file name.
    const pathParts = url.pathname.split("/");
    const fileName = pathParts[pathParts.length - 1];

    if (fileName) {
      await minioClient.removeObject(bucketName, fileName);
    }
  } catch (error) {
    console.error(`Failed to delete file from MinIO: ${fileUrl}`, error);
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
    return await minioClient.presignedGetObject(
      env.MINIO_BUCKET_NAME,
      fileName,
      3600,
    );
  },
});

export const redisConnector = utilities().createRedisConnector();
