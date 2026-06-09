---
id: 007-verify-otp-endpoint
unit: 001-staff-2fa
intent: 002-staff-2fa
status: draft
priority: must
created: 2026-06-09T00:00:00Z
assigned_bolt: 004-staff-2fa
implemented: false
---

# Story: 007-verify-otp-endpoint

## User Story

**As a** staff user who received an OTP
**I want** to submit the code and complete login
**So that** I get an authenticated session

## Acceptance Criteria

- [ ] **Given** a valid `challengeId` + correct code within TTL and attempt budget, **When** `POST /login/verify-otp`, **Then** `Authentication`+`Refresh` cookies are set, `hashedRefreshToken` is written, the challenge is deleted, the failure counter cleared, and `{ message, user }` (same shape as one-step login) is returned
- [ ] **Given** an unknown or expired `challengeId`, **When** verifying, **Then** `400` "invalid or expired challenge"
- [ ] **Given** a valid challenge + wrong code (under the cap), **When** verifying, **Then** `401` "invalid code" and `attempts`/failure counter increment
- [ ] **Given** the 5th wrong code, **When** verifying, **Then** the challenge is destroyed and the response directs the user to restart login
- [ ] **Given** the account is locked (≥10 fails/15 min), **When** verifying, **Then** `429` lockout

## Technical Notes

- New route in `src/routes/authentication/index.ts`, in the **public** controller group (no `jwtPlugin` — there's no session yet)
- Delegate to `authenticationService` verify usecase; on success reuse the exact cookie + `setRefreshToken` block from `/login` (issue access + refresh, hash refresh, set both cookies)
- Returns the same `{ message, user }` object as one-step login so the frontend's post-login logic is identical
- Body validated by story 009 DTO

## Dependencies

### Requires

- 001-otp-challenge-lifecycle
- 002-otp-generation-policy
- 003-attempt-lockout
- 006-login-two-step
- 009-auth-response-schemas

### Enables

- None (completes the happy path)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Two verifies race with the same code | First deletes the challenge; second gets 400 (single-use) |
| Correct code after challenge expired | 400 invalid/expired |
| Redis down during verify | 500; no cookies issued |

## Out of Scope

- Resend (008)
- Trusted-device / skip-OTP (v2)
