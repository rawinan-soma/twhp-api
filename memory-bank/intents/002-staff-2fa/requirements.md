---
intent: 002-staff-2fa
phase: inception
status: complete
created: 2026-06-09T00:00:00Z
updated: 2026-06-09T00:00:00Z
---

# Requirements: Staff Email-OTP Two-Factor Authentication

## Intent Overview

Add a mandatory second authentication factor — an **email one-time passcode (OTP)** — to login for the three privileged Staff roles (`DOED`, `Evaluator`, `Provincial`). Factory accounts are out of scope. The login flow becomes two steps: password verification, then OTP verification. 2FA state lives entirely in Redis (no schema change, no per-user enrollment). Design decisions are recorded in `CONTEXT.md` and `docs/adr/0002-email-otp-2fa-for-staff.md` (output of a grilling session).

**Type**: Enhancement (adds MFA to the existing authentication flow).

## Business Goals

| Goal | Success Metric | Priority |
|------|---------------|----------|
| Protect privileged staff accounts against stolen-password compromise | All `DOED`/`Evaluator`/`Provincial` logins require a verified email OTP | Must |
| Ship without disrupting existing factory login or first-login onboarding | Factory login unchanged; Eval/Provincial first-login still completes in one step | Must |
| Add no operational fragility beyond what the team can monitor | OTP rides existing email queue; email-worker uptime is the single new dependency | Should |

---

## Functional Requirements

### FR-1: Mandatory OTP for Staff Login

- **Description**: After a correct username/password for an account whose role is `DOED`, `Evaluator`, or `Provincial`, login does not complete until an emailed OTP is verified. No `Authentication`/`Refresh` cookies are issued until then.
- **Acceptance Criteria**: A staff login with correct password but no OTP verification yields no auth cookies and cannot access guarded routes. Factory login is unaffected.
- **Priority**: Must
- **Related Stories**: 006-login-two-step

### FR-2: First-Login Exemption

- **Description**: While an Evaluator/Provincial account has `isChangePassword === false`, their login bypasses OTP (they set their real `email` during the first-login `editFirstPassword` step). OTP is enforced from the second login onward. `DOED` has no first-login flow and is subject to OTP from the start.
- **Acceptance Criteria**: An Eval/Provincial account with `isChangePassword=false` logs in one-step (cookies issued). The same account with `isChangePassword=true` is sent through OTP.
- **Priority**: Must
- **Related Stories**: 006-login-two-step

### FR-3: 2FA Challenge (Redis pending state)

- **Description**: A correct staff password mints a 2FA Challenge stored only in Redis at `2fa:challenge:{challengeId}` as `{ accountId, codeHash, attempts }` with a 5-minute TTL. `challengeId` is an opaque random string returned in the `/login` response body. No DB column is involved.
- **Acceptance Criteria**: A challenge key exists after step 1, expires after 5 min, and holds no plaintext code. The `challengeId` alone (without a valid code) grants no session.
- **Priority**: Must
- **Related Stories**: 001-otp-challenge-lifecycle

### FR-4: OTP Generation and Storage Policy

- **Description**: The OTP is a 6-digit numeric code generated with a CSPRNG (`crypto.randomInt`), zero-padded. It is stored **hashed** (`Bun.SHA256`), never in plaintext. A successful verify deletes the challenge key (single-use).
- **Acceptance Criteria**: Code is always 6 digits; Redis never contains the plaintext code; a verified or expired code cannot be reused.
- **Priority**: Must
- **Related Stories**: 002-otp-generation-policy

### FR-5: Verify-OTP Endpoint

- **Description**: `POST /login/verify-otp` with `{ challengeId, code }` validates the code against the challenge. On success it sets `Authentication` + `Refresh` cookies and returns the same `{ message, user }` shape as one-step login.
- **Acceptance Criteria**: Correct code within TTL and attempt budget → cookies issued + user payload. `400` invalid/expired challenge; `401` wrong code; `429` locked.
- **Priority**: Must
- **Related Stories**: 007-verify-otp-endpoint

### FR-6: Resend-OTP Endpoint

- **Description**: `POST /login/resend-otp` with `{ challengeId }` re-sends the existing code, throttled to once per 60 seconds.
- **Acceptance Criteria**: A resend within 60s of the last send returns `429`; after 60s it re-queues the OTP email for the same challenge.
- **Priority**: Should
- **Related Stories**: 008-resend-otp-endpoint

### FR-7: Attempt Limiting and Lockout

- **Description**: Brute-force controls: (a) 5 wrong codes destroy the challenge (forcing a fresh login); (b) at most one active challenge per account, re-issue throttled to once per 60s; (c) after 10 cumulative failed codes within 15 minutes, 2FA is locked for that account for 15 minutes.
- **Acceptance Criteria**: 5th wrong code on a challenge invalidates it; 11th cumulative failure within 15 min returns `429` lockout until the window elapses.
- **Priority**: Must
- **Related Stories**: 003-attempt-lockout

### FR-8: Polymorphic /login Response

- **Description**: `POST /login` returns one of two shapes. Factory/first-login staff → `{ message, user }` with cookies set (unchanged). Normal staff → `{ twoFactorRequired: true, challengeId, email }`, where `email` is masked (e.g. `r****@gmail.com`), with no cookies set.
- **Acceptance Criteria**: Response includes `twoFactorRequired: true` only for the OTP path; masked email never reveals the full local part; the one-step path is byte-compatible with today's response.
- **Priority**: Must
- **Related Stories**: 006-login-two-step, 004-email-masking, 009-auth-response-schemas

### FR-9: OTP Email Delivery

- **Description**: The OTP is delivered via the existing BullMQ `email` queue using a new `2fa-otp` job, enqueued at higher priority than bulk jobs, sent by the `email` worker with the existing retry/backoff (`attempts: 3, backoff: 5000`). Email content is a Thai-language template mirroring `sendPasswordResetEmail`.
- **Acceptance Criteria**: A staff step-1 login enqueues a `2fa-otp` job; the worker sends the code to the account email; transient SMTP failures are retried.
- **Priority**: Must
- **Related Stories**: 005-otp-email-job

### FR-10: Login-Only Enforcement (no re-prompt on refresh)

- **Description**: OTP is enforced only at fresh login. Refresh-token rotation (`rotateToken` in `jwtPlugin`) extends an already-2FA'd session and never re-prompts. `hashedRefreshToken` is written only after OTP succeeds, so the rotation path is naturally gated. `REFRESH_TOKEN_EXP` governs when 2FA recurs.
- **Acceptance Criteria**: An authenticated staff session survives access-token expiry via silent rotation with no OTP prompt; only a fresh `/login` after refresh expiry re-runs OTP.
- **Priority**: Must
- **Related Stories**: 006-login-two-step

---

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Step-1 login response | p95 latency (excludes email delivery, which is async) | < 400ms |
| OTP verify | p95 latency | < 300ms |

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Second factor | Email OTP | 6-digit, 5-min TTL, single-use, hashed at rest (`Bun.SHA256`) |
| Brute-force resistance | Attempt + issuance limits | 5/challenge, one active challenge, 10 fails/15min → 15-min lock — keeps guesses negligible vs the 10^6 space |
| Pending-state isolation | Opaque Redis challenge | No auth cookie exists until OTP passes; challenge cannot be mistaken for a session |
| Code transport | TLS + email | Accepted that email is "2-step" not strict "2-factor" (see ADR 0002) |

### Reliability

| Requirement | Metric | Target |
|-------------|--------|--------|
| OTP email delivery | Retry on transient SMTP failure | `attempts: 3, backoff: 5000` (existing queue policy) |
| Email-worker availability | Uptime (now login-critical for staff) | Monitored out-of-band; OTP jobs prioritized over bulk jobs |

---

## Constraints

### Technical Constraints

- **No DB schema change** — 2FA state is Redis-only; no `is2faEnabled` column, no enrollment table.
- **No new dependency** — reuse `jose`/`bcrypt`/`Bun.SHA256`, BullMQ `email` queue, `redisConnector`, and `node:crypto` (`randomInt`/`randomBytes`) already present in `authentication.ts`.
- Must reuse the `reset_password_token` Redis pattern for challenge/throttle keys.
- Must preserve the existing one-step `/login` response shape for Factory and first-login paths (frontend compatibility).
- Routes are autoloaded — new endpoints live in `src/routes/authentication/index.ts`.

### Business Constraints

- "Remember this device" / trusted-device skip is **out of scope** for v1 (deferred to v2).
- SMS and TOTP channels are **out of scope** for v1 (see ADR 0002).

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|----------------|-----------|
| Every staff `accounts.email` is real and reachable after first-login | Staff locked out (no code received) | First-login exemption ensures email is set before OTP is enforced; resend endpoint + admin reset as fallback |
| The `email` worker (`bun run worker`) is deployed and monitored | SMTP/worker outage blocks all staff login | Documented as login-critical in ADR 0002; OTP jobs prioritized; retry/backoff retained |
| `isChangePassword` reliably distinguishes first vs subsequent staff login | First login wrongly OTP-gated → code to placeholder email | Verified against `editFirstPassword` logic in `authentication.ts` |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|-----------|
| Channel: email vs TOTP vs SMS | rawinan | 2026-06-09 | Resolved — Email OTP (grill session, ADR 0002) |
| Enforcement: mandatory vs opt-in | rawinan | 2026-06-09 | Resolved — Mandatory, first-login exempt |
| Pending-state mechanism | rawinan | 2026-06-09 | Resolved — Opaque Redis challengeId in response body |
| Trusted-device skip | rawinan | 2026-06-09 | Resolved — Out of scope (v2) |
