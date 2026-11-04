// src/config/env.ts

function requireEnv(key: string): string {
  const val = Bun.env[key];
  if (!val) throw new Error(`Missing environment variable: ${key}`);
  return val;
}

function requireEnvNumber(key: string): number {
  const val = requireEnv(key);
  const num = Number(val);
  if (Number.isNaN(num))
    throw new Error(`Environment variable ${key} must be a number, got: "${val}"`);
  return num;
}

function requireEnvBoolean(key: string): boolean {
  const val = requireEnv(key);
  if (val !== "true" && val !== "false")
    throw new Error(`Environment variable ${key} must be "true" or "false", got: "${val}"`);
  return val === "true";
}

function optionalEnvNumber(key: string, defaultValue: number): number {
  const val = Bun.env[key];
  if (!val) return defaultValue;
  const num = Number(val);
  if (Number.isNaN(num))
    throw new Error(`Environment variable ${key} must be a number, got: "${val}"`);
  return num;
}

function optionalEnvBoolean(key: string, defaultValue: boolean): boolean {
  const val = Bun.env[key];
  if (val === undefined || val === "") return defaultValue;
  if (val !== "true" && val !== "false")
    throw new Error(`Environment variable ${key} must be "true" or "false", got: "${val}"`);
  return val === "true";
}

function optionalEnv(key: string, defaultValue: string): string {
  return Bun.env[key] ?? defaultValue;
}

export const env = {
  // Database
  DATABASE_URL: requireEnv("DATABASE_URL"),

  // App
  APP_PORT: requireEnvNumber("APP_PORT"),

  // Auth
  AUTH_JWT_SECRET: requireEnv("AUTH_JWT_SECRET"),
  AUTH_TOKEN_EXP: requireEnvNumber("AUTH_TOKEN_EXP"),
  REFRESH_JWT_SECRET: requireEnv("REFRESH_JWT_SECRET"),
  REFRESH_TOKEN_EXP: requireEnvNumber("REFRESH_TOKEN_EXP"),
  COOKIE_SECURE: requireEnvBoolean("COOKIE_SECURE"),

  // Redis
  REDIS_HOST: requireEnv("REDIS_HOST"),
  REDIS_PORT: requireEnvNumber("REDIS_PORT"),

  // SMTP
  SMTP_HOST: requireEnv("SMTP_HOST"),
  SMTP_PORT: requireEnvNumber("SMTP_PORT"),
  SMTP_STARTTLS: requireEnvBoolean("SMTP_STARTTLS"),
  SMTP_SECURE: requireEnvBoolean("SMTP_SECURE"),
  SMTP_USER: requireEnv("SMTP_USER"),
  SMTP_PASS: requireEnv("SMTP_PASS"),

  // Frontend
  FRONTEND_URL: requireEnv("FRONTEND_URL"),

  // 2FA OTP
  OTP_CHALLENGE_TTL: optionalEnvNumber("OTP_CHALLENGE_TTL", 300),
  OTP_MAX_ATTEMPTS: optionalEnvNumber("OTP_MAX_ATTEMPTS", 5),
  OTP_FAIL_WINDOW: optionalEnvNumber("OTP_FAIL_WINDOW", 900),
  OTP_FAIL_THRESHOLD: optionalEnvNumber("OTP_FAIL_THRESHOLD", 10),
  OTP_RESEND_THROTTLE: optionalEnvNumber("OTP_RESEND_THROTTLE", 60),

  // Dev OTP bypass (development only — hard-blocked when COOKIE_SECURE=true; see ADR-4)
  DEV_SKIP_OTP: optionalEnvBoolean("DEV_SKIP_OTP", false),
  DEV_BYPASS_SECRET: optionalEnv("DEV_BYPASS_SECRET", ""),

  // MinIO
  MINIO_ENDPOINT: requireEnv("MINIO_ENDPOINT"),
  MINIO_PORT: requireEnvNumber("MINIO_PORT"),
  MINIO_USE_SSL: requireEnvBoolean("MINIO_USE_SSL"),
  MINIO_ACCESS_KEY: requireEnv("MINIO_ACCESS_KEY"),
  MINIO_SECRET_KEY: requireEnv("MINIO_SECRET_KEY"),
  MINIO_BUCKET_NAME: requireEnv("MINIO_BUCKET_NAME"),
  MINIO_PUBLIC_URL: requireEnv("MINIO_PUBLIC_URL"),
} as const;

export type Env = typeof env;
