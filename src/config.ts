// src/config/env.ts

function requireEnv(key: string): string {
  const val = Bun.env[key];
  if (!val) throw new Error(`Missing environment variable: ${key}`);
  return val;
}

/**
 * A `postgres://` or `postgresql://` URL naming a host and one database. Anything else `pg` may
 * misread, putting part of the password into span attributes (`db.namespace`, `server.port`): a
 * quoted value becomes one long database name, and an unencoded `/` in a digits-first password
 * turns the digits into the port and the rest into the path (ADR-0014). The value is a secret, so
 * the error never echoes it.
 */
function requireEnvPostgresUrl(key: string): string {
  const val = requireEnv(key);
  const url = URL.parse(val);
  const isPostgres = url?.protocol === "postgres:" || url?.protocol === "postgresql:";
  const isOneDatabase = /^\/[^/@]+$/.test(url?.pathname ?? "");
  if (isPostgres && url?.hostname && isOneDatabase) return val;
  throw new Error(
    `Environment variable ${key} must be a postgres:// URL with a host and a database (value not shown; check for stray quotes)`,
  );
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

// TEMPORARY (FY2026 extension, revert 2026-10-16)
/** `YYYY-MM-DD` → host-local midnight at the start of that day; unset or empty → null. */
function optionalEnvDate(key: string): Date | null {
  const val = Bun.env[key];
  if (val === undefined || val === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
  if (match) {
    const [y, m, d] = match.slice(1).map(Number);
    const date = new Date(y, m - 1, d);
    // Round-trip rejects dates JavaScript silently rolls over, e.g. 2026-02-30 → Mar 2.
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return date;
  }
  throw new Error(`Environment variable ${key} must be a YYYY-MM-DD date, got: "${val}"`);
}

/** An http(s) URL; unset or empty → null. */
function optionalEnvUrl(key: string): string | null {
  const val = Bun.env[key];
  if (val === undefined || val === "") return null;
  const protocol = URL.parse(val)?.protocol;
  if (protocol === "http:" || protocol === "https:") return val;
  throw new Error(`Environment variable ${key} must be an http(s) URL, got: "${val}"`);
}

function optionalEnv(key: string, defaultValue: string): string {
  return Bun.env[key] ?? defaultValue;
}

export const env = {
  // Database
  DATABASE_URL: requireEnvPostgresUrl("DATABASE_URL"),

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

  // Telemetry (ADR-0014). Spans are exported over OTLP/HTTP only when the endpoint is set.
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalEnvUrl("OTEL_EXPORTER_OTLP_ENDPOINT"),
  DEPLOYMENT_ENV: optionalEnv("DEPLOYMENT_ENV", "development"),

  // TEMPORARY (FY2026 extension, revert 2026-10-16) — exclusive end of the Evaluation Period.
  // See .scratch/fiscal-year-extension-2026/issues/01-extend-fy2026-evaluation-period.md
  EVALUATION_PERIOD_END: optionalEnvDate("EVALUATION_PERIOD_END"),
} as const;

export type Env = typeof env;
