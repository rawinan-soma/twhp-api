---
stage: design
bolt: 004-staff-2fa
created: 2026-06-09T11:45:00Z
---

## Technical Design: Staff 2FA Route Layer

---

### Architecture Pattern

**Thin Route Controller** — routes delegate all business logic to `authenticationService`. No logic lives in route handlers except:
1. Reading request body / path params
2. Calling the appropriate service usecase
3. Checking the service result for `ElysiaCustomStatusResponse` and returning it directly
4. On success: issuing cookies + returning the response object

This mirrors every existing route in the codebase. The cookie-issue block is the only notable route-layer concern.

---

### Layer Structure

```text
┌─────────────────────────────────────────────────────┐
│ Presentation (Route)                                │
│ src/routes/authentication/index.ts                  │
│ - POST /login (modified)                            │
│ - POST /login/verify-otp (new)                      │
│ - POST /login/resend-otp (new)                      │
├─────────────────────────────────────────────────────┤
│ Application (Service — bolt 003)                    │
│ src/service/authentication.ts                       │
│ - requiresOtp, maskEmail                            │
│ - createChallenge, verifyChallenge, resendOtp        │
│ - getAutheticatedAccount, setRefreshToken (existing) │
├─────────────────────────────────────────────────────┤
│ Domain (Schema — bolt 004)                          │
│ src/schema/authentication.ts                        │
│ - LoginResponseDto (t.Union)                        │
│ - TwoFactorRequiredResponse                         │
│ - VerifyOtpBody, ResendOtpBody                      │
├─────────────────────────────────────────────────────┤
│ Infrastructure                                      │
│ Redis (via authenticationService — bolt 003)        │
│ BullMQ emailQueue (via authenticationService)       │
│ PostgreSQL (via authenticationService helper)       │
└─────────────────────────────────────────────────────┘
```

---

### Route Structure

All routes live in `src/routes/authentication/index.ts`. The file exports a default function `(app: App) => app.group(...)`.

**Existing controller groups** (inferred from project structure):
- Public group (no jwt): `POST /login`, `POST /rotate` (token rotation only uses refresh cookie, not jwtPlugin)
- JWT-guarded group: `POST /logout`, `GET /me` (and other protected routes)

**New routes are added to the public group** — no `jwtPlugin`, no `requireRoles`. A session does not yet exist during OTP flow.

#### Route Inventory

| Method | Path | Group | Body DTO | 200 Response | Errors |
|--------|------|-------|----------|--------------|--------|
| `POST` | `/login` | public | `LoginBody` (existing) | `t.Union([LoginSuccessDto, TwoFactorRequiredDto])` | 401, 422, 429 |
| `POST` | `/login/verify-otp` | public | `VerifyOtpBody` | `LoginSuccessDto` | 400, 401, 429 |
| `POST` | `/login/resend-otp` | public | `ResendOtpBody` | `{ message: string }` | 400, 429 |

**Note on `/login/verify-otp` path**: `elysia-autoload` maps `src/routes/authentication/index.ts` to `/twhp/api/authentication/*`. Since all 2FA routes are in the same file under the same group prefix, they are defined inline — NOT in a subdirectory. The path segment `/login/verify-otp` is relative within the group.

---

### Cookie-Issue Block (Shared)

The cookie-issue block is **identical** for both the direct-auth path (in `/login`) and the verify-otp success path. It must be extracted into a named inline helper to avoid duplication:

```typescript
// Pseudo-code — shared within the route handler closure
async function issueSession(account: AuthenticatedAccount, cookie: ElysiaContext["cookie"]) {
  const accessToken = await jwtAccess.sign({ id: account.id, role: account.role });
  const refreshToken = await jwtRefresh.sign({ id: account.id });
  const hashedRefreshToken = Bun.SHA256.hash(refreshToken, "hex");
  await authenticationService.setRefreshToken(account.id, hashedRefreshToken);
  cookie.Authentication.set({ value: accessToken, httpOnly: true, secure: env.COOKIE_SECURE, maxAge: env.AUTH_TOKEN_EXP });
  cookie.Refresh.set({ value: refreshToken, httpOnly: true, secure: env.COOKIE_SECURE, maxAge: env.REFRESH_TOKEN_EXP });
  return { message: "login successful", user: account };
}
```

The existing `/login` route already has this block. The shared helper lives as a closure inside the `.group()` callback — not exported.

---

### Modified `/login` Flow

```text
POST /login { username, password }
  │
  ▼
authenticationService.getAutheticatedAccount(username, password)
  ├── ElysiaCustomStatusResponse? → return error status
  └── account → resolveLoginPath
        │
        ├── requiresOtp(account.role, account.isChangePassword) === false
        │     └── issueSession(account, cookie) → 200 { message, user }
        │
        └── requiresOtp === true
              └── authenticationService.createChallenge(account.id, account.email)
                    ├── ElysiaCustomStatusResponse? → return error (429 lockout)
                    └── { challengeId } → 200 {
                            twoFactorRequired: true,
                            challengeId,
                            email: authenticationService.maskEmail(account.email)
                          }
                          [NO cookie.set calls]
```

---

### `POST /login/verify-otp` Flow

```text
POST /login/verify-otp { challengeId, code }
  │
  ▼
authenticationService.verifyChallenge(challengeId, code)
  ├── ElysiaCustomStatusResponse? → return error (400/401/429)
  └── account → issueSession(account, cookie) → 200 { message, user }
```

---

### `POST /login/resend-otp` Flow

```text
POST /login/resend-otp { challengeId }
  │
  ▼
authenticationService.resendOtp(challengeId)
  ├── ElysiaCustomStatusResponse? → return error (400/429)
  └── { ok: true } → 200 { message: "OTP re-sent" }
```

---

### Schema Design (`src/schema/authentication.ts`)

New TypeBox types to add. All existing types remain unchanged.

```typescript
// New: OTP-pending response (step-1, no cookies)
const TwoFactorRequiredResponse = t.Object({
  twoFactorRequired: t.Literal(true),
  challengeId: t.String({ description: "Opaque challenge identifier" }),
  email: t.String({ description: "Masked email address (e.g. r****@gmail.com)" }),
}, { description: "2FA challenge created — submit OTP to /login/verify-otp" });

// Existing login-success object (already defined) — reused, not redeclared
// LoginSuccessResponse = t.Object({ message: t.String(), user: UserDto })

// Modified: /login 200 becomes a discriminated union
const LoginResponseDto = t.Union([
  LoginSuccessResponse,    // direct-auth / factory / first-login
  TwoFactorRequiredResponse,  // OTP-required staff
], { description: "Login response — check twoFactorRequired to determine path" });

// New: POST /login/verify-otp body
const VerifyOtpBody = t.Object({
  challengeId: t.String({ minLength: 1, description: "challengeId from /login step-1" }),
  code: t.String({ pattern: "^[0-9]{6}$", description: "6-digit OTP code from email" }),
});

// New: POST /login/resend-otp body
const ResendOtpBody = t.Object({
  challengeId: t.String({ minLength: 1, description: "challengeId from /login step-1" }),
});
```

**Composition rule**: `TwoFactorRequiredResponse` is a new declaration. `LoginSuccessResponse` is the existing object already in the schema file — import/reuse it. `LoginResponseDto` wraps both in `t.Union`.

---

### OpenAPI Detail

Each route uses `.detail({ summary, description, tags })` for OpenAPI generation:

| Route | Summary | Tags |
|-------|---------|------|
| `POST /login` | "Staff/Factory login (step 1)" | `["Authentication"]` |
| `POST /login/verify-otp` | "Submit OTP to complete staff login (step 2)" | `["Authentication"]` |
| `POST /login/resend-otp` | "Request OTP resend (60s throttle)" | `["Authentication"]` |

---

### Security Design

| Concern | Approach |
|---------|----------|
| Pre-session routes | All new routes are in public group — no existing auth guard needed |
| OTP brute-force | Enforced in service layer (5-attempt cap, 10/15min lockout) — route layer just surfaces status codes |
| Cookie flags | `httpOnly: true`, `secure: env.COOKIE_SECURE` — never issued on OTP-pending path |
| Code in logs | `code` field from request body is never logged — request log only captures method/path/status |
| challengeId exposure | Opaque UUID only — no account info embedded |
| Login-only enforcement | `jwtPlugin` (`rotateToken`) never calls OTP endpoints — service layer has no OTP prompt on token rotation |

---

### NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| Step-1 latency p95 < 400ms | Email enqueue is async (BullMQ fire-and-forget from service) — route returns before SMTP |
| Type safety | All request/response shapes are TypeBox DTOs — Elysia validates and infers types at compile time |
| OpenAPI accuracy | `t.Union` for polymorphic 200 — both shapes documented; discriminator `twoFactorRequired` is explicit |

---

### Integration Points

| Integration | Change |
|-------------|--------|
| `src/service/authentication.ts` | No change — consumes `requiresOtp`, `maskEmail`, `createChallenge`, `verifyChallenge`, `resendOtp` from bolt 003 |
| `src/routes/authentication/index.ts` | Modify `/login` handler; add `/login/verify-otp` and `/login/resend-otp` to public group |
| `src/schema/authentication.ts` | Add `TwoFactorRequiredResponse`, `LoginResponseDto` (union), `VerifyOtpBody`, `ResendOtpBody` |
| `jwtPlugin` / `rotateToken` | No change — login-only enforcement is a constraint, not a code change |

---

### Implementation Order

1. `src/schema/authentication.ts` — add 4 new TypeBox types (no dependencies)
2. `src/routes/authentication/index.ts`:
   a. Add `issueSession` closure helper
   b. Modify existing `/login` handler to branch on `requiresOtp`
   c. Add `POST /login/verify-otp` handler
   d. Add `POST /login/resend-otp` handler
3. `bunx tsc --noEmit` — verify no type errors
