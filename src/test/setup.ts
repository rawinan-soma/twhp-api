// Test environment setup — provides fallback values for vars that are
// required by config.ts but absent from .env in local dev.
// Real deployed environments must always set these explicitly.
process.env.DATABASE_URL ??= "postgresql://admin:bds64928hvlop@localhost:5433/twhp";
process.env.APP_PORT ??= "3000";
process.env.AUTH_JWT_SECRET ??= "test-jwt-secret-for-local-testing-only";
process.env.AUTH_TOKEN_EXP ??= "3600";
process.env.REFRESH_JWT_SECRET ??= "test-refresh-secret-for-local-testing-only";
process.env.REFRESH_TOKEN_EXP ??= "86400";
process.env.COOKIE_SECURE ??= "false";
process.env.REDIS_HOST ??= "localhost";
process.env.REDIS_PORT ??= "6380";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_STARTTLS ??= "false";
process.env.SMTP_SECURE ??= "false";
process.env.SMTP_USER ??= "test@test.com";
process.env.SMTP_PASS ??= "test";
process.env.FRONTEND_URL ??= "http://localhost:3000";
process.env.MINIO_ENDPOINT ??= "localhost";
process.env.MINIO_PORT ??= "9000";
process.env.MINIO_USE_SSL ??= "false";
process.env.MINIO_ACCESS_KEY ??= "minioadmin";
process.env.MINIO_SECRET_KEY ??= "minioadmin";
process.env.MINIO_BUCKET_NAME ??= "twhp";
process.env.MINIO_PUBLIC_URL ??= "http://localhost:9000";
