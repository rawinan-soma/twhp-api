import { describe, expect, it } from "bun:test";

// config.ts validates env and builds the `env` object at import (no network I/O),
// so we load it in a child process with a controlled environment per case (001 ACs).
const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  APP_PORT: "3000",
  AUTH_JWT_SECRET: "a",
  AUTH_TOKEN_EXP: "900",
  REFRESH_JWT_SECRET: "r",
  REFRESH_TOKEN_EXP: "604800",
  COOKIE_SECURE: "false",
  REDIS_HOST: "localhost",
  REDIS_PORT: "6379",
  SMTP_HOST: "localhost",
  SMTP_PORT: "587",
  SMTP_STARTTLS: "true",
  SMTP_SECURE: "false",
  SMTP_USER: "u",
  SMTP_PASS: "p",
  FRONTEND_URL: "http://localhost",
  MINIO_ENDPOINT: "localhost",
  MINIO_PORT: "9000",
  MINIO_USE_SSL: "false",
  MINIO_ACCESS_KEY: "a",
  MINIO_SECRET_KEY: "s",
  MINIO_BUCKET_NAME: "b",
  MINIO_PUBLIC_URL: "http://localhost:9000",
};

const SNIPPET =
  "import('./src/config.ts')" +
  ".then(m=>process.stdout.write(JSON.stringify({skip:m.env.DEV_SKIP_OTP,secret:m.env.DEV_BYPASS_SECRET})))" +
  ".catch(e=>{process.stderr.write(String((e&&e.message)||e));process.exit(1)})";

async function loadConfig(overrides: Record<string, string | undefined>) {
  const env: Record<string, string> = { ...BASE_ENV };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  // Use the running bun binary by absolute path — a custom `env` drops PATH.
  const proc = Bun.spawn([process.execPath, "-e", SNIPPET], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  return { exitCode, out, err };
}

describe("config — 001 dev bypass env vars", () => {
  it("001-AC-1 defaults: unset → DEV_SKIP_OTP=false, DEV_BYPASS_SECRET=''", async () => {
    const { exitCode, out } = await loadConfig({
      DEV_SKIP_OTP: undefined,
      DEV_BYPASS_SECRET: undefined,
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ skip: false, secret: "" });
  });

  it("001-AC-1b DEV_SKIP_OTP=true parsed as boolean true; secret captured verbatim", async () => {
    const { exitCode, out } = await loadConfig({ DEV_SKIP_OTP: "true", DEV_BYPASS_SECRET: "abc" });
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ skip: true, secret: "abc" });
  });

  it("001-AC-2 malformed DEV_SKIP_OTP=yes → startup throws (non-zero exit, names the var)", async () => {
    const { exitCode, err } = await loadConfig({ DEV_SKIP_OTP: "yes" });
    expect(exitCode).not.toBe(0);
    expect(err).toContain("DEV_SKIP_OTP");
  });

  it("001-AC-3 DEV_SKIP_OTP=true with empty secret still boots (helper consumes it, fail-closed)", async () => {
    const { exitCode, out } = await loadConfig({
      DEV_SKIP_OTP: "true",
      DEV_BYPASS_SECRET: undefined,
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ skip: true, secret: "" });
  });
});
