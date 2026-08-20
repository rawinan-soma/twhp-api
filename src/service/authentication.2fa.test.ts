/**
 * 2FA service unit tests
 * Derived from story ACs: 001-otp-challenge-lifecycle, 002-otp-generation-policy,
 * 003-attempt-lockout, 004-email-masking, 005-otp-email-job
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";

// ─── Module mocks (must be registered BEFORE dynamic import of the service) ───

const redisMock = {
  get: mock(async (_key: string) => null as string | null),
  set: mock(async (..._args: unknown[]) => "OK" as const),
  del: mock(async (..._keys: unknown[]) => 1),
  exists: mock(async (..._keys: unknown[]) => 0),
  incr: mock(async (_key: string) => 1),
  expire: mock(async (_key: string, _seconds: number) => 1),
  ttl: mock(async (_key: string) => 250),
};

// `mock.module` in Bun is PROCESS-GLOBAL and is never restored between test files, so this stub
// replaces the real BullMQ queue for every file that runs after this one in the same `bun test`
// run. It must therefore expose every member those later files use — not just the ones used here.
// `close()` is called in the afterAll hooks of the evaluator-review integration suites; omitting it
// made three of them fail with "emailQueue.close is not a function".
const queueMock = {
  add: mock(async (..._args: unknown[]) => ({ id: "mock-job-id" })),
  close: mock(async () => {}),
};

mock.module("../utils", () => ({ redisConnector: redisMock }));
mock.module("../queue/email", () => ({ emailQueue: queueMock }));
mock.module("../drizzle", () => ({ db: {} }));
mock.module("../config", () => ({
  env: {
    OTP_CHALLENGE_TTL: 300,
    OTP_MAX_ATTEMPTS: 5,
    OTP_FAIL_WINDOW: 900,
    OTP_FAIL_THRESHOLD: 10,
    OTP_RESEND_THROTTLE: 60,
    AUTH_JWT_SECRET: "test-jwt-secret-key-at-least-32-chars-",
    AUTH_TOKEN_EXP: 900,
    REFRESH_JWT_SECRET: "test-refresh-secret-key-at-least-32c",
    REFRESH_TOKEN_EXP: 604800,
    COOKIE_SECURE: false,
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    SMTP_HOST: "localhost",
    SMTP_PORT: 587,
    SMTP_STARTTLS: false,
    SMTP_SECURE: false,
    SMTP_USER: "noreply@test.com",
    SMTP_PASS: "testpass",
    FRONTEND_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://test:test@localhost:5432/testdb",
    APP_PORT: 3000,
    MINIO_ENDPOINT: "localhost",
    MINIO_PORT: 9000,
    MINIO_USE_SSL: false,
    MINIO_ACCESS_KEY: "minioadmin",
    MINIO_SECRET_KEY: "minioadmin",
    MINIO_BUCKET_NAME: "test-bucket",
    MINIO_PUBLIC_URL: "http://localhost:9000",
  },
}));

// Dynamic import — mocks are applied when the module is loaded
const { createAuthenticationUsecase, Role } = await import("./authentication");

// ─── DB mock helpers ───────────────────────────────────────────────────────────

/**
 * Builds a minimal Drizzle-compatible fluent chain that resolves with `rows`.
 * Handles: .select().from().leftJoin()×N.where().then() and direct await.
 */
function makeDb(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const chain: Record<string, unknown> = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => resolved,
    limit: () => resolved,
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  return { select: () => chain } as never;
}

// ─── Shared service instance (pure-function tests, no db needed) ───────────────

const service = createAuthenticationUsecase({} as never);

// ─── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  // mockReset clears call history AND implementation — prevents cross-test contamination
  redisMock.get.mockReset();
  redisMock.set.mockReset();
  redisMock.del.mockReset();
  redisMock.exists.mockReset();
  redisMock.incr.mockReset();
  redisMock.expire.mockReset();
  redisMock.ttl.mockReset();
  queueMock.add.mockReset();

  // Restore default implementations
  redisMock.get.mockImplementation(async () => null);
  redisMock.set.mockImplementation(async () => "OK");
  redisMock.del.mockImplementation(async () => 1);
  redisMock.exists.mockImplementation(async () => 0);
  redisMock.incr.mockImplementation(async () => 1);
  redisMock.expire.mockImplementation(async () => 1);
  redisMock.ttl.mockImplementation(async () => 250);
  queueMock.add.mockImplementation(async () => ({ id: "mock-job-id" }));
});

// ─── Helper ──────────────────────────────────────────────────────────────────

function statusCode(result: unknown): number {
  return (result as { code: number }).code;
}

function challengePayload(codeHash: string, attempts = 0, accountId = 1) {
  return JSON.stringify({ accountId, codeHash, attempts });
}

// ═════════════════════════════════════════════════════════════════════════════
// Story 004 — Email Masking
// ═════════════════════════════════════════════════════════════════════════════

describe("Story 004 — Email Masking", () => {
  it("004-AC1: rawinan.soma@gmail.com → r****@gmail.com", () => {
    expect(service.maskEmail("rawinan.soma@gmail.com")).toBe("r****@gmail.com");
  });

  it("004-AC2: single-char local part a@x.com → *@x.com", () => {
    expect(service.maskEmail("a@x.com")).toBe("*@x.com");
  });

  it("004-AC3: full local part never present in output", () => {
    const result = service.maskEmail("john.doe@company.org");
    expect(result).not.toContain("ohn.doe");
    expect(result).toContain("@company.org");
    expect(result).toBe("j****@company.org");
  });

  it("004-AC3: plus-addressing masked after first char, tag hidden", () => {
    const result = service.maskEmail("a+tag@x.com");
    expect(result).toBe("a****@x.com");
    expect(result).not.toContain("tag");
  });

  it("004-AC3: domain always preserved verbatim", () => {
    const result = service.maskEmail("user@sub.domain.co.th");
    expect(result).toContain("@sub.domain.co.th");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// FR-1 / FR-2 — requiresOtp (stories 001, 006)
// ═════════════════════════════════════════════════════════════════════════════

describe("requiresOtp — role and first-login routing", () => {
  it("FR-1: Factory is always exempt, regardless of isChangePassword", () => {
    expect(service.requiresOtp(Role.Factory, false)).toBe(false);
    expect(service.requiresOtp(Role.Factory, true)).toBe(false);
  });

  it("FR-2: Evaluator on first login (isChangePassword=false) is exempt", () => {
    expect(service.requiresOtp(Role.Evaluator, false)).toBe(false);
  });

  it("FR-1: Evaluator after first login (isChangePassword=true) requires OTP", () => {
    expect(service.requiresOtp(Role.Evaluator, true)).toBe(true);
  });

  it("FR-2: Provincial on first login (isChangePassword=false) is exempt", () => {
    expect(service.requiresOtp(Role.Provincial, false)).toBe(false);
  });

  it("FR-1: Provincial after first login (isChangePassword=true) requires OTP", () => {
    expect(service.requiresOtp(Role.Provincial, true)).toBe(true);
  });

  it("FR-1: DOED always requires OTP (isChangePassword is always true for DOED)", () => {
    expect(service.requiresOtp(Role.DOED, true)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Story 002 — OTP Generation Policy (via createChallenge)
// ═════════════════════════════════════════════════════════════════════════════

describe("Story 002 — OTP Generation Policy", () => {
  const ACCOUNT_ID = 1;
  const EMAIL = "staff@example.com";

  it("002-AC1: generated code is a 6-digit zero-padded numeric string", async () => {
    await service.createChallenge(ACCOUNT_ID, EMAIL);

    const jobData = queueMock.add.mock.calls[0][1] as { email: string; code: string };
    expect(jobData.code).toMatch(/^\d{6}$/);
  });

  it("002-AC2: only codeHash (SHA-256 hex) stored in Redis — not the plaintext code", async () => {
    await service.createChallenge(ACCOUNT_ID, EMAIL);

    const setCalls = redisMock.set.mock.calls;
    const challengeCall = setCalls.find((c) => String(c[0]).startsWith("2fa:challenge:"));
    expect(challengeCall).toBeDefined();

    const stored = JSON.parse(challengeCall![1] as string);
    expect(stored).not.toHaveProperty("code");
    // codeHash is a SHA-256 hex string (64 hex chars)
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("002-AC3: stored hash matches SHA-256 of the code sent to the email job", async () => {
    await service.createChallenge(ACCOUNT_ID, EMAIL);

    const setCalls = redisMock.set.mock.calls;
    const challengeCall = setCalls.find((c) => String(c[0]).startsWith("2fa:challenge:"));
    const stored = JSON.parse(challengeCall![1] as string);

    const jobData = queueMock.add.mock.calls[0][1] as { code: string };
    const expectedHash = Bun.SHA256.hash(jobData.code, "hex");

    expect(stored.codeHash).toBe(expectedHash);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Story 001 + 003 + 005 — createChallenge
// ═════════════════════════════════════════════════════════════════════════════

describe("Story 001/003/005 — createChallenge", () => {
  const ACCOUNT_ID = 42;
  const EMAIL = "staff@example.com";

  it("001-AC1: stores challenge with accountId, attempts:0, and 300s TTL", async () => {
    const result = await service.createChallenge(ACCOUNT_ID, EMAIL);

    expect(result).toHaveProperty("challengeId");
    expect(typeof (result as { challengeId: string }).challengeId).toBe("string");

    const setCalls = redisMock.set.mock.calls;
    const challengeCall = setCalls.find((c) => String(c[0]).startsWith("2fa:challenge:"));
    expect(challengeCall).toBeDefined();
    expect(challengeCall![2]).toBe("EX");
    expect(challengeCall![3]).toBe(300);

    const stored = JSON.parse(challengeCall![1] as string);
    expect(stored.accountId).toBe(ACCOUNT_ID);
    expect(stored.attempts).toBe(0);
  });

  it("005-AC1: enqueues 2fa-otp job with email at priority 1", async () => {
    await service.createChallenge(ACCOUNT_ID, EMAIL);

    expect(queueMock.add).toHaveBeenCalledTimes(1);
    const [jobName, jobData, jobOpts] = queueMock.add.mock.calls[0];
    expect(jobName).toBe("2fa-otp");
    expect((jobData as { email: string }).email).toBe(EMAIL);
    expect((jobOpts as { priority: number }).priority).toBe(1);
  });

  it("005-AC4: createChallenge does not block on email delivery (enqueue is async)", async () => {
    // The function should complete before the email is 'sent'
    let emailSent = false;
    queueMock.add.mockImplementation(async () => {
      emailSent = true;
      return { id: "job" };
    });

    const result = await service.createChallenge(ACCOUNT_ID, EMAIL);
    // result is available regardless of email sending behaviour
    expect(result).toHaveProperty("challengeId");
    expect(emailSent).toBe(true); // enqueue was called (fire-and-forget from service POV)
  });

  it("003-AC4: returns 429 when cumulative lockout threshold (10) is reached", async () => {
    redisMock.get.mockResolvedValueOnce("10"); // failKey = 10

    const result = await service.createChallenge(ACCOUNT_ID, EMAIL);

    expect(statusCode(result)).toBe(429);
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it("003-AC3: reuses existing challengeId when resend throttle is still live (no new email)", async () => {
    const existingId = "existing-challenge-abc";
    redisMock.get
      .mockResolvedValueOnce(null) // failKey: not locked
      .mockResolvedValueOnce(existingId); // activeKey: existing challenge
    redisMock.exists.mockResolvedValueOnce(1); // resend throttle active

    const result = await service.createChallenge(ACCOUNT_ID, EMAIL);

    expect(result).toEqual({ challengeId: existingId });
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it("003-AC3: replaces stale challenge when throttle has lapsed", async () => {
    const staleId = "stale-challenge-id";
    redisMock.get
      .mockResolvedValueOnce(null) // failKey: not locked
      .mockResolvedValueOnce(staleId); // activeKey: stale challenge
    redisMock.exists.mockResolvedValueOnce(0); // throttle lapsed

    const result = await service.createChallenge(ACCOUNT_ID, EMAIL);

    // Old challenge deleted
    const delKeys = redisMock.del.mock.calls.flatMap((c) => c).map(String);
    expect(delKeys.some((k) => k.includes(staleId))).toBe(true);

    // New challengeId issued
    expect((result as { challengeId: string }).challengeId).not.toBe(staleId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Story 001 + 002 + 003 — verifyChallenge
// ═════════════════════════════════════════════════════════════════════════════

describe("Story 001/002/003 — verifyChallenge", () => {
  const CHALLENGE_ID = "verify-challenge-id";
  const ACCOUNT_ID = 1;

  it("001-AC4: returns 400 when challengeId does not exist in Redis", async () => {
    redisMock.get.mockResolvedValueOnce(null);

    const result = await service.verifyChallenge(CHALLENGE_ID, "123456");

    expect(statusCode(result)).toBe(400);
  });

  it("003-AC4: returns 429 when cumulative lockout threshold reached", async () => {
    redisMock.get
      .mockResolvedValueOnce(challengePayload(Bun.SHA256.hash("111111", "hex"))) // challenge
      .mockResolvedValueOnce("10"); // failCount = 10 (threshold)

    const result = await service.verifyChallenge(CHALLENGE_ID, "000000");

    expect(statusCode(result)).toBe(429);
  });

  it("002-AC3 / 003-AC1: wrong code returns 401 and increments both attempt counters", async () => {
    const realHash = Bun.SHA256.hash("111111", "hex");
    redisMock.get.mockResolvedValueOnce(challengePayload(realHash, 0)).mockResolvedValueOnce(null); // failCount: not locked

    const result = await service.verifyChallenge(CHALLENGE_ID, "000000"); // wrong code

    expect(statusCode(result)).toBe(401);
    expect(redisMock.incr).toHaveBeenCalled(); // fail counter incremented
  });

  it("003-AC2: 5th wrong code destroys challenge — user told to restart login", async () => {
    const realHash = Bun.SHA256.hash("111111", "hex");
    redisMock.get
      .mockResolvedValueOnce(challengePayload(realHash, 4)) // 4 prior attempts
      .mockResolvedValueOnce(null); // failCount: not locked

    const result = await service.verifyChallenge(CHALLENGE_ID, "000000");

    expect(statusCode(result)).toBe(401);
    // Challenge and active keys must be deleted
    const deletedKeys = redisMock.del.mock.calls.flatMap((c) => c).map(String);
    expect(deletedKeys.some((k) => k.startsWith("2fa:challenge:"))).toBe(true);
    expect(deletedKeys.some((k) => k.startsWith("2fa:active:"))).toBe(true);
  });

  it("001-AC3 / 002-AC4 / 003-AC5: correct code — challenge deleted, fail counter cleared", async () => {
    const code = "654321";
    const codeHash = Bun.SHA256.hash(code, "hex");
    const mockAccount = {
      id: ACCOUNT_ID,
      username: "doedadmin",
      role: "DOED",
      change_pw: false,
      eval_level: null,
      firstName: "Test",
      lastName: "Admin",
    };

    redisMock.get
      .mockResolvedValueOnce(challengePayload(codeHash, 0)) // challenge
      .mockResolvedValueOnce(null); // failCount: 0 (not locked)

    const svc = createAuthenticationUsecase(makeDb([mockAccount]));
    const result = await svc.verifyChallenge(CHALLENGE_ID, code);

    // Redis cleanup
    const deletedKeys = redisMock.del.mock.calls.flatMap((c) => c).map(String);
    expect(deletedKeys.some((k) => k.startsWith("2fa:challenge:"))).toBe(true);
    expect(deletedKeys.some((k) => k.startsWith("2fa:active:"))).toBe(true);
    expect(deletedKeys.some((k) => k.startsWith("2fa:fail:"))).toBe(true);

    // Returns account (not an error status)
    expect((result as { code?: number }).code).toBeUndefined();
    expect((result as { id: number }).id).toBe(ACCOUNT_ID);
  });

  it("002-AC4: correct code cannot be replayed (single-use — challenge deleted on success)", async () => {
    const code = "123456";
    const codeHash = Bun.SHA256.hash(code, "hex");
    const mockAccount = {
      id: 1,
      username: "u",
      role: "DOED",
      change_pw: false,
      eval_level: null,
      firstName: "A",
      lastName: "B",
    };

    redisMock.get.mockResolvedValueOnce(challengePayload(codeHash)).mockResolvedValueOnce(null);

    const svc = createAuthenticationUsecase(makeDb([mockAccount]));
    await svc.verifyChallenge(CHALLENGE_ID, code); // first use

    // Second use: challenge is gone (DEL was called)
    redisMock.get.mockResolvedValueOnce(null); // challenge no longer exists
    const replayResult = await svc.verifyChallenge(CHALLENGE_ID, code);
    expect(statusCode(replayResult)).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Story 003 — resendOtp
// ═════════════════════════════════════════════════════════════════════════════

describe("Story 003/005 — resendOtp", () => {
  const CHALLENGE_ID = "resend-challenge-id";
  const ACCOUNT_ID = 7;
  const EMAIL = "staff@example.com";
  const STORED = () => challengePayload("old-hash", 2, ACCOUNT_ID);

  it("001-AC4: returns 400 when challenge does not exist", async () => {
    redisMock.get.mockResolvedValueOnce(null);

    const result = await service.resendOtp(CHALLENGE_ID);

    expect(statusCode(result)).toBe(400);
  });

  it("003-AC4: returns 429 when account is locked out", async () => {
    redisMock.get
      .mockResolvedValueOnce(STORED()) // challenge exists
      .mockResolvedValueOnce("10"); // failCount = 10

    const result = await service.resendOtp(CHALLENGE_ID);

    expect(statusCode(result)).toBe(429);
  });

  it("003-AC3: returns 429 when 60s resend throttle is active", async () => {
    redisMock.get
      .mockResolvedValueOnce(STORED()) // challenge
      .mockResolvedValueOnce(null); // failCount: not locked
    redisMock.exists.mockResolvedValueOnce(1); // throttle active

    const result = await service.resendOtp(CHALLENGE_ID);

    expect(statusCode(result)).toBe(429);
  });

  it("003-AC3 / 005-AC1: success issues fresh code, resets attempts to 0, sets throttle, enqueues job", async () => {
    redisMock.get
      .mockResolvedValueOnce(STORED()) // challenge
      .mockResolvedValueOnce(null); // failCount: not locked
    redisMock.exists.mockResolvedValueOnce(0); // throttle not active

    const svc = createAuthenticationUsecase(makeDb([{ email: EMAIL }]));
    const result = await svc.resendOtp(CHALLENGE_ID);

    expect(result).toEqual({ ok: true });

    // Fresh challenge stored with attempts: 0
    const setCalls = redisMock.set.mock.calls;
    const updatedChallenge = setCalls.find((c) => String(c[0]).startsWith("2fa:challenge:"));
    expect(updatedChallenge).toBeDefined();
    const updated = JSON.parse(updatedChallenge![1] as string);
    expect(updated.attempts).toBe(0);
    expect(updated.codeHash).not.toBe("old-hash"); // fresh code hash

    // Resend throttle set (60s)
    const throttleCall = setCalls.find((c) => String(c[0]).startsWith("2fa:resend:"));
    expect(throttleCall).toBeDefined();
    expect(throttleCall![3]).toBe(60);

    // 2fa-otp job enqueued
    expect(queueMock.add).toHaveBeenCalledTimes(1);
    expect(queueMock.add.mock.calls[0][0]).toBe("2fa-otp");
    expect((queueMock.add.mock.calls[0][1] as { email: string }).email).toBe(EMAIL);
  });
});
