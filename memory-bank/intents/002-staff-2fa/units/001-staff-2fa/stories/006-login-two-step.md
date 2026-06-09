---
id: 006-login-two-step
unit: 001-staff-2fa
intent: 002-staff-2fa
status: draft
priority: must
created: 2026-06-09T00:00:00Z
assigned_bolt: 004-staff-2fa
implemented: false
---

# Story: 006-login-two-step

## User Story

**As a** staff user
**I want** my correct password to trigger an emailed OTP instead of an immediate session
**So that** my privileged account requires a second factor — while factories and my first login are unaffected

## Acceptance Criteria

- [ ] **Given** a correct **Factory** password, **When** `/login` is called, **Then** cookies are set and `{ message, user }` is returned exactly as today (no OTP)
- [ ] **Given** a correct **Eval/Provincial** password with `isChangePassword === false`, **When** `/login` is called, **Then** cookies are set and `{ message, user }` is returned (first-login exemption)
- [ ] **Given** a correct **staff** password requiring OTP (DOED always; Eval/Provincial with `isChangePassword === true`), **When** `/login` is called, **Then** no cookies are set, a challenge is created, a `2fa-otp` email is enqueued, and `{ twoFactorRequired: true, challengeId, email }` (email masked) is returned
- [ ] **Given** a wrong password, **When** `/login` is called, **Then** `401` "invalid username or password" as today — no challenge created, no email sent
- [ ] **Given** an account currently locked (`2fa:fail` ≥ 10 in window), **When** `/login` is called, **Then** `429` lockout is returned without creating a challenge
- [ ] **Given** an authenticated staff session whose access token expires, **When** `jwtPlugin` rotates the refresh token, **Then** no OTP is prompted (login-only enforcement)

## Technical Notes

- Add a `requiresOtp(role, isChangePassword)` decision: `DOED` → true; `Evaluator`/`Provincial` → `isChangePassword === true`; `Factory` → false
- `getAutheticatedAccount` already returns role; extend the staff branch to also surface `isChangePassword` (already joined in `getAccountById`; fetch it here too)
- Reuse the existing cookie-issuing block for the non-OTP paths to keep the response byte-compatible
- For the OTP path, defer `helper.setRefreshToken` until verify (story 007) — this is what gates `rotateToken`
- Mask via story 004 helper

## Dependencies

### Requires

- 001-otp-challenge-lifecycle
- 003-attempt-lockout
- 004-email-masking
- 005-otp-email-job
- 009-auth-response-schemas

### Enables

- 007-verify-otp-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Eval flips `isChangePassword` mid-session | Next fresh login is OTP-gated; current session unaffected |
| Staff with already-active challenge re-logs in | Reuse/resend existing challenge (story 003), don't duplicate |
| Factory with `isValidate=false` | Existing 401 "factory not validate" still applies, before any OTP logic |

## Out of Scope

- The verify and resend endpoints (007, 008)
- TypeBox schema definitions (009)
