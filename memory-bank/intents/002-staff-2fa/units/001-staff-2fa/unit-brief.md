---
unit: 001-staff-2fa
intent: 002-staff-2fa
phase: inception
status: draft
created: 2026-06-09T00:00:00Z
updated: 2026-06-09T00:00:00Z
---

# Unit Brief: Staff Email-OTP 2FA

## Purpose

Add a mandatory email-OTP second factor to staff login (`DOED`, `Evaluator`, `Provincial`). Split the login flow into password → OTP, with all 2FA state held in Redis. The sole unit for this intent — extends authentication, no schema changes.

## Scope

### In Scope

- 2FA Challenge lifecycle in Redis (`2fa:challenge:{id}` → `{ accountId, codeHash, attempts }`, 5-min TTL, single-use)
- OTP generation (6-digit, `crypto.randomInt`) and hashed storage (`Bun.SHA256`)
- Attempt limiting (5/challenge), one-active-challenge + 60s resend throttle, cumulative lockout (10 fails / 15 min → 15-min lock)
- Email masking helper (`r****@gmail.com`)
- `2fa-otp` BullMQ job + worker handler + Thai email template (higher priority)
- Two-step login: modify `POST /login` (polymorphic response, first-login & factory exemption), add `POST /login/verify-otp`, `POST /login/resend-otp`
- TypeBox response DTOs for the new/modified endpoints

### Out of Scope

- Any DB schema change / per-user 2FA enrollment toggle
- TOTP / authenticator app and SMS channels (v2 — ADR 0002)
- "Remember this device" / trusted-device skip (v2)
- Re-prompting 2FA on refresh rotation or mid-session
- Changes to Factory login behaviour

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Mandatory OTP for staff login | Must |
| FR-2 | First-login exemption (Eval/Provincial) | Must |
| FR-3 | 2FA Challenge (Redis pending state) | Must |
| FR-4 | OTP generation & storage policy | Must |
| FR-5 | Verify-OTP endpoint | Must |
| FR-6 | Resend-OTP endpoint | Should |
| FR-7 | Attempt limiting & lockout | Must |
| FR-8 | Polymorphic /login response | Must |
| FR-9 | OTP email delivery | Must |
| FR-10 | Login-only enforcement | Must |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| **Staff Account** | `accounts` row with role `DOED`/`Evaluator`/`Provincial` | id, username, email, role, isChangePassword (role table) |
| **2FA Challenge** | Redis-only pending state after correct password | challengeId, accountId, codeHash, attempts, TTL |
| **OTP** | 6-digit numeric code emailed to the account | code (transient), codeHash (stored), single-use |
| **Failure Counter** | Redis counter for cumulative lockout | `2fa:fail:{accountId}`, count, 15-min window |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `createChallenge` | Generate OTP, store hashed challenge, enqueue email | accountId, email | challengeId |
| `verifyChallenge` | Validate code, enforce attempts/lockout, clear on success | challengeId, code | account or error status |
| `resendOtp` | Re-enqueue email for an existing challenge (60s throttle) | challengeId | ok or 429 |
| `maskEmail` | Mask local part for the step-1 response | email | masked string |
| `requiresOtp` | Decide if a logged-in account must go through OTP | role, isChangePassword | boolean |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 9 |
| Must Have | 8 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-otp-challenge-lifecycle | Redis challenge create/verify/expire | Must | Draft |
| 002-otp-generation-policy | 6-digit CSPRNG code, hashed, single-use | Must | Draft |
| 003-attempt-lockout | Per-challenge cap + cumulative lockout + resend throttle | Must | Draft |
| 004-email-masking | Mask email for step-1 response | Must | Draft |
| 005-otp-email-job | `2fa-otp` queue job + worker + template | Must | Draft |
| 006-login-two-step | Modify /login: polymorphic + exemptions | Must | Draft |
| 007-verify-otp-endpoint | `POST /login/verify-otp` | Must | Draft |
| 008-resend-otp-endpoint | `POST /login/resend-otp` | Should | Draft |
| 009-auth-response-schemas | TypeBox DTOs for new/modified responses | Must | Draft |

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Authentication (existing) | Extends `authenticationService`, `/login`, `jwtPlugin`, `rotateToken`, cookie helpers |
| Email queue/worker (existing) | `emailQueue.add("2fa-otp", …)` + new worker `switch` case |
| Redis (`redisConnector`) | Challenge, failure counter, resend throttle keys |

### Depended By

None — terminal enhancement.

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| SMTP (via email worker) | Deliver OTP | **Medium — now login-critical for staff** (see ADR 0002) |
| Redis | Pending state + throttling | Low (already core infra) |

---

## Technical Context

### Suggested Technology

- Bun + ElysiaJS (existing stack)
- `node:crypto` `randomInt` for OTP (already importing `randomBytes` in `authentication.ts`)
- `Bun.SHA256` for code hashing (already used for refresh-token hashing)
- `redisConnector` (ioredis) — mirror `reset_password_token` key pattern
- BullMQ `email` queue with `priority` option on the `2fa-otp` job

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `src/service/authentication.ts` | Extend usecase/helper | Function |
| `src/routes/authentication/index.ts` | Modify `/login`, add 2 routes | ElysiaJS autoload |
| `src/queue/email.ts` + `src/worker/email.ts` | New `2fa-otp` job + handler | BullMQ |
| `src/schema/authentication.ts` | New/modified TypeBox DTOs | TypeBox |
| `src/utils.ts` (`redisConnector`) | Redis access | ioredis |

### Data Storage

No new persistent storage. Transient Redis keys only:
- `2fa:challenge:{challengeId}` → `{ accountId, codeHash, attempts }`, EX 300
- `2fa:fail:{accountId}` → counter, EX 900 (15-min lockout window)
- `2fa:resend:{challengeId}` → throttle marker, EX 60

---

## Constraints

- No DB schema changes
- No new npm dependency (ask before installing — per CLAUDE.md)
- Preserve existing one-step `/login` response shape for Factory and first-login paths
- OTP stored hashed only; never log the plaintext code
- File/email I/O (enqueue) stays outside any DB transaction

## Success Criteria

### Functional

- [ ] Staff normal login requires a verified OTP before cookies are issued
- [ ] Factory and Eval/Provincial first-login complete in one step
- [ ] Wrong/expired/locked paths return 401/400/429 correctly
- [ ] Refresh rotation never triggers an OTP prompt

### Non-Functional

- [ ] Brute force bounded per lockout policy
- [ ] OTP never stored or logged in plaintext
- [ ] Step-1 login p95 < 400ms (email async)

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 003-staff-2fa | ddd-construction-bolt | 001, 002, 003, 004, 005 | Service core: challenge lifecycle, OTP policy, lockout, masking, email job |
| 004-staff-2fa | ddd-construction-bolt | 006, 007, 008, 009 | Route layer: two-step login + verify/resend endpoints + response schemas |
