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

async function loadConfig(overrides: Record<string, string | undefined>, snippet = SNIPPET) {
  const env: Record<string, string> = { ...BASE_ENV };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  // Use the running bun binary by absolute path — a custom `env` drops PATH.
  const proc = Bun.spawn([process.execPath, "-e", snippet], {
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

// TEMPORARY (FY2026 extension, revert 2026-10-16)
const PERIOD_SNIPPET =
  "import('./src/config.ts')" +
  ".then(m=>process.stdout.write(JSON.stringify({end:m.env.EVALUATION_PERIOD_END?.toISOString()??null})))" +
  ".catch(e=>{process.stderr.write(String((e&&e.message)||e));process.exit(1)})";

describe("config — EVALUATION_PERIOD_END (FY2026 extension)", () => {
  const load = (value: string | undefined) =>
    loadConfig({ TZ: "Asia/Bangkok", EVALUATION_PERIOD_END: value }, PERIOD_SNIPPET);

  it("unset → null", async () => {
    const { exitCode, out } = await load(undefined);
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ end: null });
  });

  it("empty → null", async () => {
    const { exitCode, out } = await load("");
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ end: null });
  });

  it("2026-10-16 → local (Bangkok) midnight at the start of that day", async () => {
    const { exitCode, out } = await load("2026-10-16");
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ end: "2026-10-15T17:00:00.000Z" });
  });

  it.each([
    "16/10/2026",
    "2026-10-16T00:00",
    "2026-02-30",
    "soon",
  ])("malformed %p → startup throws naming the var", async (value) => {
    const { exitCode, err } = await load(value);
    expect(exitCode).not.toBe(0);
    expect(err).toContain("EVALUATION_PERIOD_END");
  });
});

const TELEMETRY_SNIPPET =
  "import('./src/config.ts')" +
  ".then(m=>process.stdout.write(JSON.stringify({endpoint:m.env.OTEL_EXPORTER_OTLP_ENDPOINT,environment:m.env.DEPLOYMENT_ENV})))" +
  ".catch(e=>{process.stderr.write(String((e&&e.message)||e));process.exit(1)})";

describe("config — telemetry", () => {
  const load = (overrides: Record<string, string | undefined>) =>
    loadConfig(overrides, TELEMETRY_SNIPPET);

  it("unset → no OTLP endpoint and DEPLOYMENT_ENV=development", async () => {
    const { exitCode, out } = await load({
      OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
      DEPLOYMENT_ENV: undefined,
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ endpoint: null, environment: "development" });
  });

  it("empty OTEL_EXPORTER_OTLP_ENDPOINT → null", async () => {
    const { exitCode, out } = await load({ OTEL_EXPORTER_OTLP_ENDPOINT: "" });
    expect(exitCode).toBe(0);
    expect(JSON.parse(out).endpoint).toBeNull();
  });

  it("reads both when set", async () => {
    const { exitCode, out } = await load({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://alloy:4318",
      DEPLOYMENT_ENV: "staging",
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(out)).toEqual({ endpoint: "http://alloy:4318", environment: "staging" });
  });

  it.each([
    "alloy:4318",
    "not a url",
  ])("malformed endpoint %p → startup throws naming the var", async (value) => {
    const { exitCode, err } = await load({ OTEL_EXPORTER_OTLP_ENDPOINT: value });
    expect(exitCode).not.toBe(0);
    expect(err).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });
});

// A malformed DATABASE_URL is parsed by `pg` as one long database name, password included, which
// the pg instrumentation then puts on every span as `db.namespace`. Reject it at startup instead,
// without echoing the value.
const DB_SNIPPET =
  "import('./src/config.ts')" +
  ".then(m=>process.stdout.write(m.env.DATABASE_URL))" +
  ".catch(e=>{process.stderr.write(String((e&&e.message)||e));process.exit(1)})";

describe("config — DATABASE_URL shape", () => {
  const load = (value: string) => loadConfig({ DATABASE_URL: value }, DB_SNIPPET);

  it.each([
    "postgres://u:p@localhost:5432/db",
    "postgresql://admin:pw@postgres:5432/twhp",
  ])("accepts %p", async (value) => {
    const { exitCode, out } = await load(value);
    expect(exitCode).toBe(0);
    expect(out).toBe(value);
  });

  it.each([
    ['"postgresql://admin:s3cretpw@postgres:5432/twhp"', "quoted"],
    ["'postgresql://admin:s3cretpw@postgres:5432/twhp'", "single-quoted"],
    ["mysql://admin:s3cretpw@postgres:5432/twhp", "another scheme"],
    ["postgresql://admin:s3cretpw@postgres:5432", "no database"],
    ["postgresql://admin:s3cretpw@postgres:5432/", "empty database"],
    ["admin:s3cretpw@postgres:5432/twhp", "no scheme"],
    // An unencoded "/" in a digits-first password parses with the digits as the port and the rest
    // of the password in the path; pg would then report the digits as `server.port`.
    ["postgres://admin:12345/s3cretpw@postgres:5432/twhp", "password split into port and path"],
    ["postgresql://admin:pw@postgres:5432/twhp/s3cretpw", "nested path"],
  ])("rejects %p (%s) without echoing it", async (value) => {
    const { exitCode, err } = await load(value);
    expect(exitCode).not.toBe(0);
    expect(err).toContain("DATABASE_URL");
    expect(err).not.toContain("s3cretpw");
  });
});
