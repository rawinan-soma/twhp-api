---
id: 017-dev-otp-bypass
unit: 001-dev-otp-bypass
intent: 006-dev-otp-bypass
type: ddd-construction-bolt
status: complete
stories:
  - 001-bypass-config
  - 002-bypass-decision-helper
  - 003-login-route-wiring
created: 2026-06-23T00:00:00.000Z
started: 2026-06-23T04:27:07.000Z
completed: "2026-06-23T04:46:24Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-06-23T04:27:07.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-06-23T04:27:07.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-06-23T04:27:07.000Z
    artifact: adr-4-cookie-secure-as-production-signal.md
  - name: implement
    completed: 2026-06-23T04:27:07.000Z
    artifact: src/config.ts + src/index.ts + src/service/authentication.ts + src/routes/authentication/index.ts
requires_bolts: []
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 017-dev-otp-bypass

## Overview

Add a guarded, development-only OTP bypass to staff login. Two optional env vars gate it
(`DEV_SKIP_OTP`, `DEV_BYPASS_SECRET`), a single fail-closed helper decides per request, and one
branch in `POST /login` skips the OTP step when a secret `X-Dev-Bypass` header matches in a
non-production environment. Production (`COOKIE_SECURE === true`) hard-disables it.

## Objective

Let developers/QA log in as any staff role without OTP friction locally, while making it
structurally impossible for the bypass to weaken production auth and keeping the normal login
surface byte-for-byte unchanged.

## Stories Included

- **001-bypass-config**: `DEV_SKIP_OTP` + `DEV_BYPASS_SECRET` env vars + startup production warning (Must)
- **002-bypass-decision-helper**: `isDevOtpBypass(headerValue)` — fail-closed gate + constant-time compare + prod hard-block (Must)
- **003-login-route-wiring**: Read `X-Dev-Bypass`, OR bypass into the `/login` non-OTP branch, log usage, doc the header (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Confirm the bypass-decision inputs (flag, `COOKIE_SECURE`, secret, header) and the single `/login` branch point; no new entities/persistence
- [ ] **2. design**: `config.ts` helper additions (`optionalEnvBoolean`/`optionalEnv`), `isDevOtpBypass` placement and guard order, constant-time compare strategy, route header read + branch
- [ ] **3. implement**: `src/config.ts` (2 vars + helpers + startup warning) → `src/service/authentication.ts` (`isDevOtpBypass`) → `src/routes/authentication/index.ts` (header + OR branch + log + OpenAPI note)
- [ ] **4. test**: Bypass active → cookies + no Redis/email; wrong password → 401; no/wrong header → unchanged OTP path; `COOKIE_SECURE=true` → bypass impossible; secret never logged; all three staff roles identical output

## Dependencies

### Requires

- None (extends existing authentication + config; no other bolts)

### Enables

- None (terminal bolt — feature complete after this)

## Success Criteria

- [ ] `/login` + valid `X-Dev-Bypass` in dev (flag on, secret set) issues cookies in one step, no `2fa-otp` email, no `2fa:*` key
- [ ] Wrong password → `401` even with a valid header
- [ ] Missing/wrong header → unchanged behaviour (normal OTP path or one-step exemption)
- [ ] `COOKIE_SECURE=true` makes the bypass impossible; one startup warning when the flag is set in prod
- [ ] Secret compared in constant time and never logged/returned/stored
- [ ] OpenAPI doc reflects the optional dev-only header

## Notes

- Single seam: OR the bypass into the existing `!requiresOtp(...)` branch — reuse the exact
  cookie/token issue + `setRefreshToken` block (no duplicated response shape).
- `isDevOtpBypass` is a pure function (no I/O) — cheap guards first, constant-time compare last.
- Mind `timingSafeEqual` throwing on unequal buffer lengths — handle without a timing leak.
- Keep all env access in `src/config.ts`; no stray `Bun.env`. Ask before adding any dependency.
