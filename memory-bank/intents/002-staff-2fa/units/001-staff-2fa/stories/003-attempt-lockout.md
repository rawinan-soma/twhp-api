---
id: 003-attempt-lockout
unit: 001-staff-2fa
intent: 002-staff-2fa
status: draft
priority: must
created: 2026-06-09T00:00:00Z
assigned_bolt: 003-staff-2fa
implemented: false
---

# Story: 003-attempt-lockout

## User Story

**As a** system protecting privileged accounts
**I want** strict per-challenge and per-account brute-force limits
**So that** a 6-digit code stays safe against guessing and challenge re-creation abuse

## Acceptance Criteria

- [ ] **Given** an active challenge, **When** a wrong code is submitted, **Then** `attempts` increments and the failure counter `2fa:fail:{accountId}` increments
- [ ] **Given** a challenge at 4 prior wrong attempts, **When** a 5th wrong code is submitted, **Then** the challenge is deleted and the response tells the user to restart login
- [ ] **Given** an account with an active challenge, **When** `/login` is called again, **Then** no second concurrent challenge is created — the existing one is reused/resent (subject to the 60s throttle), not duplicated
- [ ] **Given** `2fa:fail:{accountId}` has reached 10 within a 15-minute window, **When** any further verify or login is attempted, **Then** `429` "too many attempts, try again later" is returned until the window elapses
- [ ] **Given** a successful verification, **When** it completes, **Then** the failure counter for that account is cleared

## Technical Notes

- `2fa:fail:{accountId}` → `INCR` with `EXPIRE 900` on first increment (15-min sliding-ish window)
- `2fa:resend:{challengeId}` → SET `EX 60` marks the last send for the 60s resend/issue throttle (shared with story 008)
- Lockout check runs at the top of both verify and login-step-1 for the account
- Thresholds are the grill-approved values: 5/challenge, 1 active, 60s resend, 10 fails / 15 min → 15-min lock. Keep them as named constants so they are easy to tune.

## Dependencies

### Requires

- 001-otp-challenge-lifecycle
- 002-otp-generation-policy

### Enables

- 007-verify-otp-endpoint
- 008-resend-otp-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Wrong code on already-expired challenge | 400 invalid/expired (not counted toward 5/challenge) |
| Lockout hits mid-challenge | 429 takes precedence over remaining per-challenge attempts |
| Legitimate user fat-fingers a few times | Forgiving within limits; clear guidance to retry/resend |
| Clock/TTL skew | Rely on Redis TTL, not app clock |

## Out of Scope

- The email send itself (005) and resend endpoint wiring (008)
- IP-based rate limiting (relies on account-scoped limits for v1)
