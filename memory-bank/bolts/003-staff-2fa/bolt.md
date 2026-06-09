---
id: 003-staff-2fa
unit: 001-staff-2fa
intent: 002-staff-2fa
type: ddd-construction-bolt
status: complete
stories:
  - 001-otp-challenge-lifecycle
  - 002-otp-generation-policy
  - 003-attempt-lockout
  - 004-email-masking
  - 005-otp-email-job
created: 2026-06-09T00:00:00.000Z
started: 2026-06-09T08:00:00.000Z
completed: "2026-06-09T06:59:13Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-06-09T08:00:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-06-09T08:30:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-06-09T09:00:00.000Z
    artifact: adr-1-fresh-code-on-resend.md, adr-2-smtp-login-critical.md
  - name: implement
    completed: 2026-06-09T10:00:00.000Z
    artifact: src/service/authentication.ts, src/worker/email.ts, src/config.ts
requires_bolts: []
enables_bolts:
  - 004-staff-2fa
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 003-staff-2fa

## Overview

Build the 2FA service core: the Redis-backed challenge lifecycle, OTP generation/hashing policy, brute-force limits (per-challenge + cumulative lockout + resend throttle), the email-masking helper, and the `2fa-otp` email job + worker handler. This bolt has no internal dependencies and is foundational for the route layer.

## Objective

Extend `authenticationService` with challenge create/verify/resend usecases and a `requiresOtp` decision, add Redis key conventions, and wire the `2fa-otp` job through `emailQueue` + the email worker — all with no DB schema change and no new dependency.

## Stories Included

- **001-otp-challenge-lifecycle**: Redis challenge create/verify/expire (Must)
- **002-otp-generation-policy**: 6-digit CSPRNG code, hashed, single-use (Must)
- **003-attempt-lockout**: per-challenge cap + cumulative lockout + resend throttle (Must)
- **004-email-masking**: mask email for step-1 response (Must)
- **005-otp-email-job**: `2fa-otp` queue job + worker handler + Thai template (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Domain model — 2FA Challenge, OTP, Failure Counter entities; Redis key map (`2fa:challenge:{id}`, `2fa:fail:{accountId}`, `2fa:resend:{challengeId}`); lockout constants
- [ ] **2. design**: Technical design — `authenticationService` usecase signatures (`createChallenge`, `verifyChallenge`, `resendOtp`, `requiresOtp`, `maskEmail`), ioredis SET/GET/DEL/INCR/EXPIRE usage, BullMQ priority option, worker `switch` extension. **Resolve the resend "same vs fresh code" question (story 008 notes) — recommend fresh code + reset attempts**
- [ ] **3. implement**: `src/service/authentication.ts` (+ `src/utils.ts` if mask is shared), `src/queue/email.ts` usage, `src/worker/email.ts` (`sendOtpEmail`)
- [ ] **4. test**: Formula/limits — code format, hash-only storage, 5/challenge destroy, 10/15min lockout, 60s throttle, mask correctness

## Dependencies

### Requires

- None (first bolt in this intent)

### Enables

- 004-staff-2fa (route layer consumes these usecases)

## Success Criteria

- [ ] `createChallenge` stores hashed code + returns opaque id, 300s TTL
- [ ] `verifyChallenge` enforces single-use, per-challenge cap, and lockout
- [ ] `requiresOtp` correctly classifies DOED/Eval/Provincial/Factory + first-login
- [ ] `2fa-otp` job sends the code with retry/backoff at elevated priority
- [ ] OTP never stored or logged in plaintext

## Notes

- Mirror the `reset_password_token` Redis pattern already in `authenticationService`
- Reuse `Bun.SHA256` (refresh-token hashing) and `node:crypto` `randomInt`/`randomBytes` — no new dependency
- Email I/O (enqueue) stays outside any DB transaction
- Email worker becomes login-critical — keep retry/backoff (`attempts: 3, backoff: 5000`)
