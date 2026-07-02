---
unit: 001-dev-otp-bypass
bolt: 017-dev-otp-bypass
stage: design
status: complete
updated: 2026-06-23T04:27:07Z
---

# Technical Design - Developer OTP Bypass

## Architecture Pattern

**Layered (route → service → config)** — the project's existing pattern. No new pattern is
introduced. The `OtpBypassPolicy` is realized as a **pure function on the existing
`authenticationService`** (domain/application layer), fed by validated config (`env`) and
invoked from the `POST /login` route (presentation layer). Stateless; no infrastructure layer
touched (no DB/Redis/queue).

## Layer Structure

```text
┌─────────────────────────────────────────────────────────────┐
│  Presentation   src/routes/authentication/index.ts          │
│                 - read `x-dev-bypass` header                 │
│                 - branch: !requiresOtp(...) || isDevOtpBypass │
│                 - emit OtpBypassed log on bypass             │
│                 - OpenAPI: document optional dev header       │
├─────────────────────────────────────────────────────────────┤
│  Application/   src/service/authentication.ts               │
│  Domain         - isDevOtpBypass(presentedSecret): boolean   │
│                   (pure policy; constant-time compare)       │
├─────────────────────────────────────────────────────────────┤
│  Config         src/config.ts                                │
│                 - DEV_SKIP_OTP (optional bool, default false) │
│                 - DEV_BYPASS_SECRET (optional str, default "")│
│                 - optionalEnvBoolean / optionalEnv helpers    │
│                 - startup warning if flag set in production   │
└─────────────────────────────────────────────────────────────┘
```

## API Design

| Endpoint | Method | Request | Response |
| -------- | ------ | ------- | -------- |
| `/login` | POST | body `{ username, password }` (unchanged) **+ optional header** `X-Dev-Bypass: <secret>` | **Unchanged union.** When the bypass is active and creds valid → `LoginSuccessResponse` `{ message, user }` + `Authentication`/`Refresh` cookies (the existing non-OTP shape). Otherwise identical to today (`TwoFactorRequiredResponse` for OTP-required staff, `401`, etc.). |

No new endpoint. No change to `/login/verify-otp` or `/login/resend-otp`. The response schema
`LoginResponse` (the existing `t.Union([LoginSuccessResponse, TwoFactorRequiredResponse])`) is
unchanged — the bypass only changes *which* arm is returned, not the shapes.

### Header contract

- Name: `X-Dev-Bypass` (Elysia lowercases to `x-dev-bypass`).
- Optional; absence = normal flow. Documented in OpenAPI as a **dev-only** header.
- Value: the shared `DEV_BYPASS_SECRET`. Mismatch = normal flow (no error surfaced — avoids
  turning the endpoint into a secret oracle).

## Data Persistence

| Table | Columns | Relationships |
| ----- | ------- | ------------- |
| _(none)_ | — | No schema change. No Redis key. No BullMQ job. Stateless policy over `env` + header. |

## Security Design

| Concern | Approach |
| ------- | -------- |
| Credential integrity | Unchanged — `getAutheticatedAccount(username, password)` runs first; wrong password → `401` regardless of header (FR-4). The header skips **only** OTP. |
| Secret comparison | `node:crypto` `timingSafeEqual` over `Buffer.from(...)`. Guard the unequal-length throw by pre-checking via a hash-to-fixed-length or length compare that does not branch on secret content (see Implementation Notes). |
| Fail-closed | Cheap guards short-circuit before the compare: flag off / production / empty secret / missing header → `false`. Empty `DEV_BYPASS_SECRET` can never match (FR-2). |
| Production hard-block | `env.COOKIE_SECURE === true` ⇒ `isDevOtpBypass` returns `false` unconditionally (FR-3). Defense-in-depth: even a leaked secret + correct flag cannot bypass in prod. |
| Secret hygiene | `DEV_BYPASS_SECRET` and the header value are never logged, never returned, never stored. Startup warning and `OtpBypassed` log contain no secret. |
| Logging | `OtpBypassed` logged at `warn` (notable, dev-only event) with `{ accountId, username, role }`; uses the elysia-logger instance, not `console.log` (coding-standards). |

## NFR Implementation

| Requirement | Design Approach |
| ----------- | --------------- |
| Performance | One header read + ≤4 boolean guards + one constant-time compare. No I/O. Negligible vs. the existing bcrypt verify already on the path. |
| Compatibility | Requests without a matching header hit the exact existing code paths; response bytes unchanged. Bypass reuses the **same** token-issue + `setRefreshToken` block (no duplicated shape). |
| Reliability | No new failure mode on the normal path. Bypass path avoids SMTP/Redis entirely, so it is unaffected by email-worker outages (the ADR-2 motivation). |
| Maintainability | All bypass logic in one helper (`isDevOtpBypass`) + one route branch + two config lines. Single decision point. |

## Error Handling

| Error Type | Code | Response |
| ---------- | ---- | -------- |
| Wrong password (header present) | 401 | `{ message: "invalid username or password" }` — unchanged; header ignored |
| Bypass inactive, OTP-required staff | 200 | `{ twoFactorRequired, challengeId, email(masked) }` — unchanged |
| Bypass active, creds valid | 200 | `{ message, user }` + cookies — existing non-OTP arm |
| Malformed `DEV_SKIP_OTP` env (e.g. `yes`) | startup throw | App refuses to boot (consistent with `requireEnvBoolean`) |

No new HTTP error code is introduced. A header mismatch deliberately returns the **normal OTP
flow**, not a 4xx, so the endpoint does not confirm/deny the secret.

## External Dependencies

| Service | Purpose | Integration |
| ------- | ------- | ----------- |
| Process env | Supplies `DEV_SKIP_OTP`, `DEV_BYPASS_SECRET`; `COOKIE_SECURE` already present | `src/config.ts` (`env`) |
| `node:crypto` | Constant-time compare | Already imported in `authentication.ts` (`randomBytes`); add `timingSafeEqual` |
| `@bogeychan/elysia-logger` | `OtpBypassed` + startup warning logs | Existing logger |

---

## Implementation Notes (blueprint for Stage 4)

### `src/config.ts`

Add two helpers mirroring `optionalEnvNumber`:

```ts
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
```

Add to the `env` object (after the `2FA OTP` block):

```ts
// Dev OTP bypass (development only — hard-blocked when COOKIE_SECURE=true)
DEV_SKIP_OTP: optionalEnvBoolean("DEV_SKIP_OTP", false),
DEV_BYPASS_SECRET: optionalEnv("DEV_BYPASS_SECRET", ""),
```

Startup warning (emit once). Options: a guarded log at the bottom of `config.ts`, or in
`src/index.ts` bootstrap using the app logger. Prefer bootstrap so it uses elysia-logger:

```ts
if (env.DEV_SKIP_OTP && env.COOKIE_SECURE) {
  log.warn("DEV_SKIP_OTP is set but ignored: COOKIE_SECURE=true (production). OTP stays enforced.");
}
```

### `src/service/authentication.ts`

Add a pure helper to the service object (near `requiresOtp`). Import `timingSafeEqual` from
`node:crypto`:

```ts
isDevOtpBypass: (presentedSecret: string | undefined): boolean => {
  if (!env.DEV_SKIP_OTP) return false;            // master switch
  if (env.COOKIE_SECURE) return false;            // production hard-block (FR-3)
  const secret = env.DEV_BYPASS_SECRET;
  if (!secret) return false;                      // fail-closed (FR-2)
  if (!presentedSecret) return false;
  const a = Buffer.from(presentedSecret);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;        // length check before timingSafeEqual
  return timingSafeEqual(a, b);
},
```

- The `a.length !== b.length` pre-check avoids the `timingSafeEqual` throw on unequal lengths.
  This leaks only *length equality*, not content; acceptable for a dev secret. (If stricter
  length-hiding is desired, compare SHA-256 digests of both — fixed 32-byte length. Noted as an
  optional hardening, not required for v1.)

### `src/routes/authentication/index.ts`

In the `/login` handler, read the header and OR the bypass into the existing non-OTP branch:

```ts
async ({ body, cookie: { Authentication, Refresh }, set, headers }) => {
  const { username, password } = body;
  const account = await authenticationService.getAutheticatedAccount(username, password);
  if (account instanceof ElysiaCustomStatusResponse) return account;

  const devBypass = authenticationService.isDevOtpBypass(headers["x-dev-bypass"]);

  if (!authenticationService.requiresOtp(account.role, account.isChangePassword) || devBypass) {
    // ...existing token issue + setRefreshToken + cookie set block (unchanged)...
    if (devBypass) {
      // OtpBypassed event — no secret in payload
      set.headers; // (use the route logger) log.warn({ accountId: account.id, username: account.username, role: account.role }, "OTP bypassed via dev header");
    }
    set.status = 200;
    return { message: "login successful", user: { /* ...unchanged... */ } };
  }

  // ...existing OTP challenge path (unchanged)...
}
```

- Reuse the **exact** existing issuance block — do not duplicate the response object shape.
- Access the logger the way other routes do (the elysia-logger instance available in the
  handler context); do not `console.log`.
- OpenAPI: add the optional header to the route `detail` (e.g. document `X-Dev-Bypass` as a
  dev-only header under the `/login` operation), and regenerate `docs/api/*` per the project's
  doc-gen flow.

### Out of scope for implementation

- No change to `verify-otp` / `resend-otp`, Redis keys, or the email job.
- No new dependency (uses `node:crypto`, already imported). Ask before adding any.

## Story → Change Map

1. **001-bypass-config** → `src/config.ts` (2 helpers + 2 vars) + startup warning in `src/index.ts`.
2. **002-bypass-decision-helper** → `isDevOtpBypass` in `src/service/authentication.ts`.
3. **003-login-route-wiring** → `/login` header read + OR branch + `OtpBypassed` log + OpenAPI doc.
