---
id: 001-otp-challenge-lifecycle
unit: 001-staff-2fa
intent: 002-staff-2fa
status: complete
priority: must
created: 2026-06-09T00:00:00.000Z
assigned_bolt: 003-staff-2fa
implemented: true
---

# Story: 001-otp-challenge-lifecycle

## User Story

**As a** developer building the 2FA service
**I want** a Redis-backed 2FA Challenge that is created on correct password and verified later
**So that** the "password OK, OTP pending" state lives entirely server-side, isolated from auth cookies

## Acceptance Criteria

- [ ] **Given** a correct staff password, **When** a challenge is created, **Then** Redis holds `2fa:challenge:{challengeId}` = `{ accountId, codeHash, attempts: 0 }` with a 300s TTL and a new opaque `challengeId` is returned
- [ ] **Given** a challenge exists, **When** 5 minutes pass without verification, **Then** the key expires and verification returns "invalid/expired challenge"
- [ ] **Given** a valid `challengeId` + correct code, **When** verified, **Then** the challenge key is deleted (single-use) and the resolved account is returned
- [ ] **Given** a `challengeId` that does not exist, **When** verified, **Then** a 400 "invalid or expired challenge" is returned
- [ ] **Given** a `challengeId` alone (no code or wrong code), **When** used against any guarded route, **Then** no session is granted (challenge is not a token)

## Technical Notes

- Add to `authenticationService` (usecase + helper) in `src/service/authentication.ts`
- `challengeId = randomBytes(32).toString("hex")` (mirror reset-token generation)
- Use `redisConnector` with the `reset_password_token` SET/GET/DEL pattern; store value as JSON string
- Key TTL via `EX 300`
- This story owns create + verify + expiry plumbing; code format (002) and lockout (003) layer on top

## Dependencies

### Requires

- None (foundational)

### Enables

- 002-otp-generation-policy
- 003-attempt-lockout
- 007-verify-otp-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Redis unavailable during create | Surface 500; do not issue cookies |
| Duplicate create for same account | One-active-challenge rule (story 003) governs; default: replace/re-use |
| Malformed JSON in stored value | Treat as invalid challenge → 400 |

## Out of Scope

- Code generation/format (002)
- Attempt counting and lockout (003)
- Email delivery (005)
