---
stage: model
bolt: 004-staff-2fa
created: 2026-06-09T11:30:00Z
---

## Static Model: Staff 2FA Route Layer

This bolt is the **presentation layer** for the 2FA feature. The domain logic lives in bolt 003's service core. This model captures the concepts, contracts, and state transitions exposed via the HTTP API.

---

### Entities

- **LoginRequest**: `{ username: string, password: string }` — unchanged from today; the route inspects the authenticated account to decide path
- **LoginOtpPendingResponse**: `{ twoFactorRequired: true, challengeId: string, email: string }` — issued when OTP is required; `email` is the masked address from `maskEmail()`; no cookies set
- **LoginSuccessResponse**: `{ message: string, user: AuthenticatedAccount }` — issued immediately for exempt paths (Factory / first-login), and again on successful verify-otp; `Authentication` + `Refresh` cookies set
- **VerifyOtpRequest**: `{ challengeId: string, code: string }` — code is 6-digit numeric string validated by pattern
- **ResendOtpRequest**: `{ challengeId: string }` — no code field; service generates fresh code (per ADR-1)
- **AuthCookiePair**: `Authentication` (short-lived access JWT) + `Refresh` (long-lived refresh JWT) — issued only on direct login success or verify-otp success; never on resend or step-1 OTP path

---

### Value Objects

- **ChallengeId**: Opaque string (UUID) returned by `createChallenge`; clients treat it as an opaque token — not inspectable
- **MaskedEmail**: Result of `maskEmail(email)` — `r****@gmail.com` shape; only the first char and domain are revealed; carried in the step-1 response
- **OtpCode**: 6-digit zero-padded numeric string `[0-9]{6}` — appears in the verify request body; never in a response
- **JwtAccessToken** / **JwtRefreshToken**: Opaque JWT strings embedded in HTTP-only cookies; expiry and rotation governed by existing `jwtPlugin`

---

### Aggregates

- **LoginFlow** (root: `LoginRequest`):
  - Members: `LoginRequest`, `AuthCookiePair` (conditionally), `LoginOtpPendingResponse` or `LoginSuccessResponse`
  - Invariant: cookies are NEVER issued at step-1 when `requiresOtp` is true
  - Invariant: `challengeId` is NEVER present in the direct-auth success response

- **OtpVerificationFlow** (root: `VerifyOtpRequest`):
  - Members: `VerifyOtpRequest`, `AuthCookiePair` (on success), `LoginSuccessResponse` (on success)
  - Invariant: `hashedRefreshToken` is written to DB only on success — not during challenge lifecycle
  - Invariant: challenge is deleted (single-use) immediately on any final outcome (success or 5th-fail)

---

### Domain Events

- **LoginDirectCompleted**: Trigger: Factory or first-login Eval/Provincial with correct password. Payload: `{ accountId, role }`. Outcome: access + refresh cookies issued, `setRefreshToken` written.
- **ChallengeCreated**: Trigger: staff login requiring OTP. Payload: `{ challengeId, maskedEmail }`. Outcome: `2fa:challenge` set in Redis, `2fa-otp` job enqueued; NO cookies issued.
- **OtpVerifiedSessionIssued**: Trigger: correct code submitted within TTL and attempt budget. Payload: `{ accountId, challengeId }`. Outcome: challenge deleted, fail counter cleared, cookies + `setRefreshToken` issued.
- **OtpVerifyFailed**: Trigger: wrong code (under cap). Payload: `{ challengeId, attempts }`. Outcome: attempts + fail counter incremented; no state change to cookies.
- **ChallengeBurned**: Trigger: 5th wrong code or challenge TTL expiry. Payload: `{ challengeId }`. Outcome: challenge and active keys deleted; user must restart login.
- **OtpResent**: Trigger: resend request with throttle lapsed. Payload: `{ challengeId }`. Outcome: fresh code generated (ADR-1), codeHash updated, attempts reset to 0, throttle set, `2fa-otp` re-enqueued.

---

### Domain Services

- **LoginDecisionService** (route-level, thin wrapper):
  - `resolveLoginPath(account)` → `direct-auth | requires-otp`
  - Uses `authenticationService.requiresOtp(role, isChangePassword)` from bolt 003
  - Issues cookies for `direct-auth`; delegates to `createChallenge` for `requires-otp`

- **OtpVerifyService** (route-level, thin wrapper):
  - `completeVerification(challengeId, code)` → issues cookies or returns error status
  - Delegates to `authenticationService.verifyChallenge`, then issues access + refresh on success
  - `setRefreshToken` is called ONLY on this path — never at `/login` for OTP-required accounts

- **ResendService** (route-level, thin wrapper):
  - `requestResend(challengeId)` → `{ ok: true }` or error status
  - Delegates entirely to `authenticationService.resendOtp`

---

### Repository Interfaces

All persistence interfaces are inherited from bolt 003. This bolt adds no new Redis keys or DB operations. The only writes are:
- `helper.setRefreshToken(accountId, hashedRefreshToken)` — on `OtpVerifiedSessionIssued` (bolt 003 helper, already exists)
- Cookies are set via Elysia's `cookie` API — not a repository concern

---

### Login Flow State Machine

```
                     POST /login
                          │
              ┌───────────┴───────────┐
              │ wrong password        │ correct password
              ▼                       ▼
         401 Unauthorized    resolveLoginPath(account)
                                       │
                    ┌──────────────────┴──────────────────┐
                    │ direct-auth                           │ requires-otp
                    │ (Factory / first-login Eval/Prov)    │ (DOED / Eval-Prov isChangePassword=true)
                    ▼                                       ▼
          issue cookies                         createChallenge(accountId, email)
          setRefreshToken                               │
          200 { message, user }                        ▼
                                        200 { twoFactorRequired: true,
                                             challengeId, email(masked) }
                                        [NO cookies]
                                               │
                              ┌────────────────┼──────────────────┐
                              │ POST /login/   │ POST /login/     │ timeout
                              │ verify-otp     │ resend-otp       │ (5 min TTL)
                              ▼                ▼                  ▼
                       verifyChallenge   resendOtp (ADR-1:    400 expired
                              │          fresh code)
             ┌────────────────┴────────────────┐
             │ correct                          │ wrong / lockout
             ▼                                  ▼
      issue cookies                     401/429 error
      setRefreshToken                   (challenge preserved
      200 { message, user }              until cap / TTL)
```

---

### Ubiquitous Language

| Term | Definition |
|------|------------|
| **Direct-auth path** | `/login` returns session immediately — Factory and Eval/Provincial with `isChangePassword === false` |
| **OTP-required path** | `/login` returns a challenge, cookies deferred until verify-otp |
| **Challenge** | Short-lived Redis record created at step-1 for OTP-required accounts; holds `accountId`, `codeHash`, `attempts` |
| **ChallengeId** | Opaque UUID identifying the challenge; passed between step-1 and step-2 by the client |
| **Masked email** | `r****@gmail.com` — local part redacted except first character; surfaced in step-1 response to hint which inbox to check |
| **First-login exemption** | `Evaluator`/`Provincial` accounts with `isChangePassword === false` bypass OTP on their very first login |
| **Login-only enforcement** | OTP is prompted ONLY at `/login`. Refresh token rotation (`rotateToken` in `jwtPlugin`) never triggers OTP |
| **Session gate** | `setRefreshToken` write + cookie issuance; only happens on `direct-auth` or `OtpVerifiedSessionIssued` |
| **Throttle** | 60-second window preventing duplicate OTP resend requests for the same challenge (`2fa:resend:{challengeId}`) |
| **Cumulative lockout** | After 10 failed OTP attempts across challenges within 15 min, all login attempts for the account return 429 |

---

### Story → Domain Concept Mapping

| Story | Primary Concept |
|-------|-----------------|
| 006-login-two-step | LoginDecisionService, LoginFlow aggregate, `direct-auth` vs `requires-otp` paths, `ChallengeCreated` / `LoginDirectCompleted` events |
| 007-verify-otp-endpoint | OtpVerificationFlow aggregate, `OtpVerifiedSessionIssued` / `OtpVerifyFailed` / `ChallengeBurned` events, session gate |
| 008-resend-otp-endpoint | ResendService, `OtpResent` event, throttle enforcement (per ADR-1: fresh code, not replay) |
| 009-auth-response-schemas | `LoginOtpPendingResponse`, `LoginSuccessResponse`, `VerifyOtpRequest`, `ResendOtpRequest`, `AuthCookiePair` value objects as TypeBox DTOs |

---

### ⚠️ Story 008 AC Conflict with ADR-1

Story 008's acceptance criteria states: *"the challenge TTL and code are unchanged (re-sends the same code, does not mint a new challenge or reset attempts)"*.

ADR-1 (accepted, bolt 003) mandates the opposite: **fresh code, attempts reset to 0**.

**Resolution**: ADR-1 takes precedence. The bolt 003 service implementation already follows ADR-1. Story 008's AC is incorrect/stale — it reflects an early draft before the resend design was settled. The route layer will delegate to `authenticationService.resendOtp()` which implements ADR-1's behavior. This conflict should be acknowledged but does not require a new ADR.
