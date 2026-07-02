import { beforeEach, describe, expect, it, mock } from "bun:test";

// `isDevOtpBypass` closes over the imported `env` object and reads it at call-time,
// so a single mutable fake env lets us drive every case (002 acceptance criteria).
const fakeEnv: { DEV_SKIP_OTP: boolean; COOKIE_SECURE: boolean; DEV_BYPASS_SECRET: string } = {
  DEV_SKIP_OTP: false,
  COOKIE_SECURE: false,
  DEV_BYPASS_SECRET: "",
};

// Prevent the real service's eager Redis/BullMQ/PG construction during import.
mock.module("../config", () => ({ env: fakeEnv }));
mock.module("../utils", () => ({ redisConnector: {}, utilities: () => ({}) }));
mock.module("../queue/email", () => ({ emailQueue: { add: async () => {} } }));
mock.module("../drizzle", () => ({ db: {} }));

const { authenticationService } = await import("./authentication");

const SECRET = "s3cr3t-dev-key";

beforeEach(() => {
  // Default to a fully-active dev environment; each test flips one condition.
  fakeEnv.DEV_SKIP_OTP = true;
  fakeEnv.COOKIE_SECURE = false;
  fakeEnv.DEV_BYPASS_SECRET = SECRET;
});

describe("isDevOtpBypass — 002 decision helper", () => {
  it("002-AC-1 flag on + dev env + secret set + matching header → true", () => {
    expect(authenticationService.isDevOtpBypass(SECRET)).toBe(true);
  });

  it("002-AC-2 COOKIE_SECURE=true (production) → false even with the correct secret", () => {
    fakeEnv.COOKIE_SECURE = true;
    expect(authenticationService.isDevOtpBypass(SECRET)).toBe(false);
  });

  it("002-AC-3 DEV_SKIP_OTP=false → false (master switch)", () => {
    fakeEnv.DEV_SKIP_OTP = false;
    expect(authenticationService.isDevOtpBypass(SECRET)).toBe(false);
  });

  it("002-AC-4 empty configured secret → false for any header (fail-closed)", () => {
    fakeEnv.DEV_BYPASS_SECRET = "";
    expect(authenticationService.isDevOtpBypass("")).toBe(false);
    expect(authenticationService.isDevOtpBypass("anything")).toBe(false);
  });

  it("002-AC-5 undefined / empty / mismatched header → false", () => {
    expect(authenticationService.isDevOtpBypass(undefined)).toBe(false);
    expect(authenticationService.isDevOtpBypass("")).toBe(false);
    expect(authenticationService.isDevOtpBypass("wrong-secret-X")).toBe(false);
  });

  it("002-AC-6 length-mismatch header → false without throwing (constant-time guard)", () => {
    expect(() => authenticationService.isDevOtpBypass(`${SECRET}extra`)).not.toThrow();
    expect(authenticationService.isDevOtpBypass(`${SECRET}extra`)).toBe(false);
    expect(authenticationService.isDevOtpBypass(SECRET.slice(0, 3))).toBe(false);
  });
});
