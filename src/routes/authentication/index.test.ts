import { beforeEach, describe, expect, it, mock } from "bun:test";
import Elysia, { status } from "elysia";

// ── Mock definitions (must precede dynamic import) ────────────────────────

const mockGetAutheticatedAccount = mock(async (..._: unknown[]) => null as any);
const mockRequiresOtp = mock((..._: unknown[]) => false as boolean);
const mockCreateChallenge = mock(async (..._: unknown[]) => ({ challengeId: "chal-001" }));
const mockMaskEmail = mock((..._: unknown[]) => "r****@gmail.com");
const mockVerifyChallenge = mock(async (..._: unknown[]) => null as any);
const mockResendOtp = mock(async (..._: unknown[]) => ({ ok: true }) as const);
const mockIsDevOtpBypass = mock((..._: unknown[]) => false as boolean);
const mockIssueToken = mock(async (..._: unknown[]) => "mock-token" as string);
const mockSetRefreshToken = mock(async (..._: unknown[]) => undefined);
const mockGetCookieOption = mock((..._: unknown[]) => ({
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 900,
}));

mock.module("../../service/authentication", () => ({
  authenticationService: {
    getAutheticatedAccount: mockGetAutheticatedAccount,
    requiresOtp: mockRequiresOtp,
    isDevOtpBypass: mockIsDevOtpBypass,
    createChallenge: mockCreateChallenge,
    maskEmail: mockMaskEmail,
    verifyChallenge: mockVerifyChallenge,
    resendOtp: mockResendOtp,
    helper: {
      issueToken: mockIssueToken,
      setRefreshToken: mockSetRefreshToken,
      getCookieOption: mockGetCookieOption,
    },
  },
}));

mock.module("../../middleware/jwt", () => ({
  jwtPlugin: new Elysia(),
}));

const { default: authRoute } = await import("./index");
const app = new Elysia().use(authRoute as any);

// ── Fixtures ──────────────────────────────────────────────────────────────

const COOKIE_OPT = {
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 900,
};

const FACTORY_ACCOUNT = {
  id: 1,
  username: "factory01",
  role: "Factory",
  email: "factory@example.com",
  isChangePassword: false,
  full_name: "Factory User",
};

const EVAL_FIRST_LOGIN = {
  id: 3,
  username: "eval01",
  role: "Evaluator",
  email: "eval@example.com",
  isChangePassword: false,
  full_name: "Eval User",
};

const STAFF_OTP_ACCOUNT = {
  id: 2,
  username: "staff01",
  role: "DOED",
  email: "staff@example.com",
  isChangePassword: true,
  full_name: "Staff User",
};

const VERIFIED_ACCOUNT = {
  id: 2,
  username: "staff01",
  role: "DOED",
  change_pw: true,
  eval_level: null,
  firstName: "Staff",
  lastName: "User",
  full_name: "Staff User",
};

// OTP-required accounts across all three staff roles (003-AC-5)
const STAFF_ROLES_OTP = [
  {
    id: 2,
    username: "doed01",
    role: "DOED",
    email: "doed@example.com",
    isChangePassword: true,
    full_name: "Doed User",
  },
  {
    id: 4,
    username: "eval02",
    role: "Evaluator",
    email: "eval2@example.com",
    isChangePassword: true,
    full_name: "Eval Two",
  },
  {
    id: 5,
    username: "prov01",
    role: "Provincial",
    email: "prov@example.com",
    isChangePassword: true,
    full_name: "Prov User",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

async function POST(
  path: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    }),
  );
}

// ── beforeEach ────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetAutheticatedAccount.mockReset();
  mockRequiresOtp.mockReset();
  mockCreateChallenge.mockReset();
  mockMaskEmail.mockReset();
  mockVerifyChallenge.mockReset();
  mockResendOtp.mockReset();
  mockIsDevOtpBypass.mockReset();
  mockIssueToken.mockReset();
  mockSetRefreshToken.mockReset();
  mockGetCookieOption.mockReset();

  mockRequiresOtp.mockImplementation((..._: unknown[]) => false);
  mockIsDevOtpBypass.mockImplementation((..._: unknown[]) => false);
  mockMaskEmail.mockImplementation((..._: unknown[]) => "r****@gmail.com");
  mockIssueToken.mockImplementation(async (...args: unknown[]) =>
    args[3] === "Authentication" ? "mock-access-token" : "mock-refresh-token",
  );
  mockSetRefreshToken.mockImplementation(async (..._: unknown[]) => undefined);
  mockGetCookieOption.mockImplementation((..._: unknown[]) => COOKIE_OPT);
});

// ═══════════════════════════════════════════════════════════════════════════
// Story 006 — POST /login two-step
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /login — 006 two-step login", () => {
  it("006-AC-1 Factory → 200 direct auth, tokens issued, no challenge", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) => FACTORY_ACCOUNT);

    const res = await POST("/login", { username: "factory01", password: "pass" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ message: "login successful", user: { id: 1, role: "Factory" } });
    expect(mockIssueToken.mock.calls.length).toBe(2);
    expect(mockSetRefreshToken.mock.calls.length).toBe(1);
    expect(mockCreateChallenge.mock.calls.length).toBe(0);
  });

  it("006-AC-2 Eval with isChangePassword=false → 200 direct auth (first-login exemption)", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) => EVAL_FIRST_LOGIN);

    const res = await POST("/login", { username: "eval01", password: "pass" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ message: "login successful", user: { id: 3, role: "Evaluator" } });
    expect(mockCreateChallenge.mock.calls.length).toBe(0);
  });

  it("006-AC-3 OTP-required staff → 200 { twoFactorRequired, challengeId, email }, no tokens", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) => STAFF_OTP_ACCOUNT);
    mockRequiresOtp.mockImplementation((..._: unknown[]) => true);
    mockCreateChallenge.mockImplementation(async (..._: unknown[]) => ({
      challengeId: "chal-001",
    }));

    const res = await POST("/login", { username: "staff01", password: "pass" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      twoFactorRequired: true,
      challengeId: "chal-001",
      email: "r****@gmail.com",
    });
    expect(mockIssueToken.mock.calls.length).toBe(0);
    expect(mockSetRefreshToken.mock.calls.length).toBe(0);
  });

  it("006-AC-4 Wrong password → 401, no challenge created", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) =>
      status(401, { message: "invalid username or password" }),
    );

    const res = await POST("/login", { username: "bad", password: "wrong" });

    expect(res.status).toBe(401);
    expect(mockCreateChallenge.mock.calls.length).toBe(0);
  });

  it("006-AC-5 Locked account (≥10 fails) → 429, no challenge created", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) =>
      status(429, { message: "too many failed attempts, please try again later" }),
    );

    const res = await POST("/login", { username: "locked", password: "pass" });

    expect(res.status).toBe(429);
    expect(mockCreateChallenge.mock.calls.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Story 003 — dev OTP bypass on POST /login (intent 006)
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /login — 003 dev OTP bypass", () => {
  it("003-AC-1 bypass active + correct staff password → 200 {message,user}, tokens issued, no challenge/email", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) => STAFF_OTP_ACCOUNT);
    mockRequiresOtp.mockImplementation((..._: unknown[]) => true);
    mockIsDevOtpBypass.mockImplementation((..._: unknown[]) => true);

    const res = await POST(
      "/login",
      { username: "staff01", password: "pass" },
      { "X-Dev-Bypass": "secret" },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ message: "login successful", user: { id: 2, role: "DOED" } });
    expect(mockIssueToken.mock.calls.length).toBe(2);
    expect(mockSetRefreshToken.mock.calls.length).toBe(1);
    expect(mockCreateChallenge.mock.calls.length).toBe(0); // no challenge ⇒ no 2fa-otp email
  });

  it("003-wiring header value reaches isDevOtpBypass", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) => STAFF_OTP_ACCOUNT);
    mockRequiresOtp.mockImplementation((..._: unknown[]) => true);
    mockIsDevOtpBypass.mockImplementation((..._: unknown[]) => true);

    await POST(
      "/login",
      { username: "staff01", password: "pass" },
      { "X-Dev-Bypass": "my-secret" },
    );

    expect(mockIsDevOtpBypass.mock.calls.length).toBe(1);
    expect(mockIsDevOtpBypass.mock.calls[0][0]).toBe("my-secret");
  });

  it("003-AC-3 wrong password + valid header → 401, no tokens, bypass not consulted (creds first)", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) =>
      status(401, { message: "invalid username or password" }),
    );
    mockIsDevOtpBypass.mockImplementation((..._: unknown[]) => true);

    const res = await POST(
      "/login",
      { username: "staff01", password: "wrong" },
      { "X-Dev-Bypass": "secret" },
    );

    expect(res.status).toBe(401);
    expect(mockIssueToken.mock.calls.length).toBe(0);
    expect(mockIsDevOtpBypass.mock.calls.length).toBe(0); // returns before bypass check
  });

  it("003-AC-4 no header + OTP-required staff → unchanged twoFactorRequired path", async () => {
    mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) => STAFF_OTP_ACCOUNT);
    mockRequiresOtp.mockImplementation((..._: unknown[]) => true);
    mockIsDevOtpBypass.mockImplementation((..._: unknown[]) => false);
    mockCreateChallenge.mockImplementation(async (..._: unknown[]) => ({
      challengeId: "chal-009",
    }));

    const res = await POST("/login", { username: "staff01", password: "pass" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ twoFactorRequired: true, challengeId: "chal-009" });
    expect(mockIssueToken.mock.calls.length).toBe(0);
  });

  it("003-AC-5 bypass yields identical {message,user} shape for DOED/Evaluator/Provincial", async () => {
    mockRequiresOtp.mockImplementation((..._: unknown[]) => true);
    mockIsDevOtpBypass.mockImplementation((..._: unknown[]) => true);

    for (const acct of STAFF_ROLES_OTP) {
      mockGetAutheticatedAccount.mockImplementation(async (..._: unknown[]) => acct);
      const res = await POST(
        "/login",
        { username: acct.username, password: "pass" },
        { "X-Dev-Bypass": "secret" },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        message: "login successful",
        user: { id: acct.id, role: acct.role, username: acct.username },
      });
      expect(body.twoFactorRequired).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Story 007 — POST /login/verify-otp
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /login/verify-otp — 007", () => {
  it("007-AC-1 Valid challenge + correct code → 200 { message, user }, setRefreshToken called", async () => {
    mockVerifyChallenge.mockImplementation(async (..._: unknown[]) => VERIFIED_ACCOUNT);

    const res = await POST("/login/verify-otp", { challengeId: "chal-001", code: "123456" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ message: "login successful", user: { id: 2, role: "DOED" } });
    expect(mockIssueToken.mock.calls.length).toBe(2);
    expect(mockSetRefreshToken.mock.calls.length).toBe(1);
  });

  it("007-AC-2 Unknown/expired challengeId → 400, no session issued", async () => {
    mockVerifyChallenge.mockImplementation(async (..._: unknown[]) =>
      status(400, { message: "invalid or expired challenge" }),
    );

    const res = await POST("/login/verify-otp", { challengeId: "bad-id", code: "123456" });

    expect(res.status).toBe(400);
    expect(mockSetRefreshToken.mock.calls.length).toBe(0);
  });

  it("007-AC-3 Wrong code under attempt cap → 401 with attemptsRemaining", async () => {
    mockVerifyChallenge.mockImplementation(async (..._: unknown[]) =>
      status(401, { message: "incorrect code", attemptsRemaining: 4 }),
    );

    const res = await POST("/login/verify-otp", { challengeId: "chal-001", code: "000000" });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ attemptsRemaining: 4 });
    expect(mockSetRefreshToken.mock.calls.length).toBe(0);
  });

  it("007-AC-4 5th wrong code → 401 directing user to restart login", async () => {
    mockVerifyChallenge.mockImplementation(async (..._: unknown[]) =>
      status(401, { message: "too many attempts, please restart login" }),
    );

    const res = await POST("/login/verify-otp", { challengeId: "chal-001", code: "000000" });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.message).toContain("restart login");
    expect(mockSetRefreshToken.mock.calls.length).toBe(0);
  });

  it("007-AC-5 Account locked → 429, no session issued", async () => {
    mockVerifyChallenge.mockImplementation(async (..._: unknown[]) =>
      status(429, { message: "too many failed attempts, please try again later" }),
    );

    const res = await POST("/login/verify-otp", { challengeId: "chal-001", code: "123456" });

    expect(res.status).toBe(429);
    expect(mockSetRefreshToken.mock.calls.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Story 008 — POST /login/resend-otp
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /login/resend-otp — 008", () => {
  it("008-AC-1 Valid challenge, throttle clear → 200 { message: 'OTP re-sent' }", async () => {
    mockResendOtp.mockImplementation(async (..._: unknown[]) => ({ ok: true }) as const);

    const res = await POST("/login/resend-otp", { challengeId: "chal-001" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ message: "OTP re-sent" });
  });

  it("008-AC-2 Resend within 60s throttle → 429", async () => {
    mockResendOtp.mockImplementation(async (..._: unknown[]) =>
      status(429, { message: "please wait before requesting another code" }),
    );

    const res = await POST("/login/resend-otp", { challengeId: "chal-001" });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body).toMatchObject({ message: "please wait before requesting another code" });
  });

  it("008-AC-3 Unknown/expired challengeId → 400", async () => {
    mockResendOtp.mockImplementation(async (..._: unknown[]) =>
      status(400, { message: "invalid or expired challenge" }),
    );

    const res = await POST("/login/resend-otp", { challengeId: "bad-id" });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Story 009 — TypeBox request validation
// ═══════════════════════════════════════════════════════════════════════════

describe("request validation — 009 auth response schemas", () => {
  it("009-AC-1 /login missing password → validation error (422 in test, 400 via app onError)", async () => {
    const res = await POST("/login", { username: "user01" });
    expect(res.status).toBe(422);
  });

  it("009-AC-2 /login/verify-otp non-digit code → validation error (pattern rejects alpha chars)", async () => {
    const res = await POST("/login/verify-otp", { challengeId: "chal-001", code: "abc123" });
    expect(res.status).toBe(422);
  });

  it("009-AC-3 /login/verify-otp 7-digit code → validation error (pattern requires exactly 6 digits)", async () => {
    const res = await POST("/login/verify-otp", { challengeId: "chal-001", code: "1234567" });
    expect(res.status).toBe(422);
  });

  it("009-AC-4 /login/resend-otp empty body → validation error (challengeId required)", async () => {
    const res = await POST("/login/resend-otp", {});
    expect(res.status).toBe(422);
  });
});
