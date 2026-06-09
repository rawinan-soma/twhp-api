---
id: 002-otp-generation-policy
unit: 001-staff-2fa
intent: 002-staff-2fa
status: complete
priority: must
created: 2026-06-09T00:00:00.000Z
assigned_bolt: 003-staff-2fa
implemented: true
---

# Story: 002-otp-generation-policy

## User Story

**As a** security-conscious developer
**I want** OTPs generated with a CSPRNG and stored only as a hash
**So that** codes are unpredictable and a Redis read-only leak never exposes a live code

## Acceptance Criteria

- [ ] **Given** a challenge is created, **When** the OTP is generated, **Then** it is a 6-digit zero-padded numeric string (`000000`–`999999`) from `crypto.randomInt(0, 1_000_000)`
- [ ] **Given** an OTP is generated, **When** stored, **Then** only `Bun.SHA256.hash(code, "hex")` is persisted in the challenge — never the plaintext
- [ ] **Given** a verification attempt, **When** comparing, **Then** the candidate is hashed and compared to `codeHash` (no plaintext comparison, no plaintext in logs)
- [ ] **Given** a successful verification, **When** it completes, **Then** the challenge (and its hash) is deleted so the code cannot be replayed

## Technical Notes

- `import { randomInt } from "node:crypto"` (alongside existing `randomBytes`)
- Zero-pad: `String(randomInt(0, 1_000_000)).padStart(6, "0")`
- Reuse `Bun.SHA256` (already used for refresh-token hashing) for consistency — no new dep
- The plaintext code exists only long enough to enqueue the email job (story 005); never written to Redis or logs

## Dependencies

### Requires

- 001-otp-challenge-lifecycle

### Enables

- 005-otp-email-job (needs the plaintext code to send)
- 007-verify-otp-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| `randomInt` returns small number (e.g. 42) | Zero-padded to `000042` |
| Code logged accidentally | Disallowed — review for `console.log(code)` |
| Hash collision | Negligible for SHA-256; not mitigated |

## Out of Scope

- TTL / single-use mechanics (001)
- Attempt limiting (003)
