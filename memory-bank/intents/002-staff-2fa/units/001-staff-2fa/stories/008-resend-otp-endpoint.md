---
id: 008-resend-otp-endpoint
unit: 001-staff-2fa
intent: 002-staff-2fa
status: complete
priority: should
created: 2026-06-09T00:00:00.000Z
assigned_bolt: 004-staff-2fa
implemented: true
---

# Story: 008-resend-otp-endpoint

## User Story

**As a** staff user who didn't receive the OTP
**I want** to request it be re-sent
**So that** I can complete login without restarting from my password

## Acceptance Criteria

- [ ] **Given** a valid active `challengeId` whose last send was > 60s ago, **When** `POST /login/resend-otp`, **Then** the existing challenge's OTP email is re-enqueued and `200` is returned
- [ ] **Given** a resend within 60s of the last send, **When** called, **Then** `429` "please wait before requesting another code"
- [ ] **Given** an unknown or expired `challengeId`, **When** called, **Then** `400` invalid/expired challenge
- [ ] **Given** a resend, **When** processed, **Then** the challenge TTL and code are unchanged (re-sends the same code, does not mint a new challenge or reset attempts)

## Technical Notes

- New public route in `src/routes/authentication/index.ts`
- Throttle via `2fa:resend:{challengeId}` SET `EX 60` (shared marker with story 003's issuance throttle)
- Re-send means re-enqueue the same code — but the challenge stores only `codeHash`. Decision for construction: either (a) keep resending the *same* code by also stashing the code in the queue is not possible post-create, so (b) generate a fresh code, update `codeHash`, and reset `attempts` to 0. **Recommended: (b)** — simplest and safe, since the old code becomes unusable. Flag this in the bolt's design stage.
- Mirror the reset-password 429 throttle pattern

## Dependencies

### Requires

- 001-otp-challenge-lifecycle
- 005-otp-email-job
- 009-auth-response-schemas

### Enables

- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Rapid double-tap resend | First sends, second 429 |
| Resend after lockout | 429 lockout takes precedence |
| Resend after challenge expired | 400 invalid/expired — must restart login |

## Out of Scope

- Changing the 60s throttle to be configurable per-environment (hardcode constant for v1)
