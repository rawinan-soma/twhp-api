---
id: 004-staff-2fa
unit: 001-staff-2fa
intent: 002-staff-2fa
type: ddd-construction-bolt
status: planned
stories:
  - 006-login-two-step
  - 007-verify-otp-endpoint
  - 008-resend-otp-endpoint
  - 009-auth-response-schemas
created: 2026-06-09T00:00:00Z
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts:
  - 003-staff-2fa
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 004-staff-2fa

## Overview

Wire the two-step login route layer on top of the service built in bolt 003. Modify `POST /login` to a polymorphic response with first-login/factory exemptions, add `POST /login/verify-otp` and `POST /login/resend-otp`, and define the TypeBox DTOs for all three.

## Objective

Deliver the public auth endpoints that gate staff sessions behind email OTP while keeping Factory and first-login flows byte-compatible, with accurate OpenAPI docs.

## Stories Included

- **006-login-two-step**: Modify `/login` — polymorphic + exemptions + login-only enforcement (Must)
- **007-verify-otp-endpoint**: `POST /login/verify-otp` (Must)
- **008-resend-otp-endpoint**: `POST /login/resend-otp` (Should)
- **009-auth-response-schemas**: TypeBox DTOs for new/modified responses (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Route map — confirm paths, public vs jwt-guarded grouping, request/response shapes per endpoint
- [ ] **2. design**: Technical design — ElysiaJS route structure in `src/routes/authentication/index.ts`, shared cookie-issuing helper between `/login` and `/verify-otp`, `t.Union` for polymorphic `/login` 200
- [ ] **3. implement**: `src/routes/authentication/index.ts` (modify `/login`, add 2 routes) + `src/schema/authentication.ts` (DTOs)
- [ ] **4. test**: Factory unchanged, first-login exempt, staff OTP path, wrong/expired/locked → 401/400/429, refresh rotation never re-prompts

## Dependencies

### Requires

- **003-staff-2fa** (Required — provides `createChallenge`/`verifyChallenge`/`resendOtp`/`requiresOtp`/`maskEmail` and the `2fa-otp` job)

### Enables

- None (terminal bolt — feature complete after this)

## Success Criteria

- [ ] `/login` returns `{ message, user }` + cookies for Factory and first-login staff
- [ ] `/login` returns `{ twoFactorRequired, challengeId, email(masked) }` (no cookies) for OTP-required staff
- [ ] `/login/verify-otp` issues cookies + writes `hashedRefreshToken` only on correct code
- [ ] `/login/resend-otp` re-sends within the 60s throttle, else 429
- [ ] Refresh rotation continues sessions with no OTP prompt
- [ ] OpenAPI doc reflects the new shapes

## Notes

- New endpoints go in the **public** controller group (no `jwtPlugin` — no session exists pre-verify)
- Reuse the exact access/refresh issue + `setRefreshToken` block in both `/login` (non-OTP paths) and `/verify-otp`
- `ElysiaCustomStatusResponse` check pattern for service return values (mirrors existing routes)
- Deferring `setRefreshToken` to verify is what gates `rotateToken` for the OTP path
