---
unit: 001-dev-otp-bypass
intent: 006-dev-otp-bypass
phase: inception
status: complete
created: 2026-06-23T00:00:00Z
updated: 2026-06-23T00:00:00Z
---

# Unit Brief: Developer OTP Bypass

## Purpose

Add a guarded, development-only path that skips the email-OTP second factor for staff login.
Activated per request by a secret `X-Dev-Bypass` header, master-switched by `DEV_SKIP_OTP`, and
hard-blocked in production (`COOKIE_SECURE === true`). The sole unit for this intent — extends
authentication and config, no schema/Redis/queue changes.

## Scope

### In Scope

- Two optional env vars in `src/config.ts`: `DEV_SKIP_OTP` (bool, default `false`),
  `DEV_BYPASS_SECRET` (string, default empty) + the optional-env helpers needed to validate them
- A one-time **startup warning** when `DEV_SKIP_OTP=true` in production
- A pure service helper `isDevOtpBypass(headerValue)` combining: flag on, not production, secret
  configured, and constant-time header↔secret match (fail-closed on any miss)
- Wiring the helper into `POST /login`: read the `X-Dev-Bypass` header, OR the bypass into the
  existing `!requiresOtp(...)` branch, after the unchanged credential check
- A structured log line whenever the bypass actually fires (no secret leakage)
- OpenAPI note documenting the optional dev header on `/login`

### Out of Scope

- Any change to `POST /login/verify-otp` or `POST /login/resend-otp`
- Any DB schema, Redis key, or BullMQ job change
- A dedicated `/login/dev` route (rejected — header approach chosen at Checkpoint 1)
- An `APP_ENV` variable (rejected — `COOKIE_SECURE` reused as the production signal)
- Bypassing the password/credential check (header skips OTP only)
- Frontend changes for normal login

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Header-gated OTP bypass on `/login` | Must |
| FR-2 | Multi-condition activation gate (fail-closed) | Must |
| FR-3 | Production hard-block + startup warning | Must |
| FR-4 | Credentials still required | Must |
| FR-5 | Scope: all staff roles, identical output | Must |
| FR-6 | Configuration & startup validation | Must |
| FR-7 | Observability of bypass usage | Should |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| **Bypass Config** | Startup-validated env values controlling the bypass | `DEV_SKIP_OTP` (bool), `DEV_BYPASS_SECRET` (string), `COOKIE_SECURE` (bool, existing) |
| **Bypass Decision** | Per-request boolean: may this request skip OTP? | derived from config + `X-Dev-Bypass` header |
| **Staff Account** | `accounts` row, role `DOED`/`Evaluator`/`Provincial` | id, username, role, isChangePassword |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `isDevOtpBypass` | Decide if this request may skip OTP (fail-closed) | `X-Dev-Bypass` header value | boolean |
| `requiresOtp` (existing) | Decide if an account normally needs OTP | role, isChangePassword | boolean |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 3 |
| Must Have | 3 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-bypass-config | `DEV_SKIP_OTP` + `DEV_BYPASS_SECRET` env vars + startup production warning | Must | Draft |
| 002-bypass-decision-helper | `isDevOtpBypass(headerValue)` — fail-closed gate + constant-time compare + prod hard-block | Must | Draft |
| 003-login-route-wiring | Read header, OR bypass into `/login` non-OTP branch, log usage, doc header | Must | Draft |

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Authentication (existing) | Extends `authenticationService`, `POST /login`, reuses cookie/token issue + `setRefreshToken` block and `requiresOtp` |
| Config (existing `src/config.ts`) | Adds + validates the two new env vars |

### Depended By

None — terminal developer-experience enhancement.

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Process env | Supplies flag + secret | Low — fail-closed if unset/empty |

---

## Technical Context

### Suggested Technology

- Bun + ElysiaJS (existing stack)
- `node:crypto` `timingSafeEqual` for the secret comparison (avoid a length/early-exit oracle)
- `env` object from `src/config.ts` (mirror the `OTP_*` optional-var pattern; add
  `optionalEnvBoolean` / optional-string helpers as needed)
- Existing `@bogeychan/elysia-logger` for the startup warning and bypass-usage log

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `src/config.ts` | Add + validate `DEV_SKIP_OTP`, `DEV_BYPASS_SECRET` | Bun.env |
| `src/service/authentication.ts` | Add `isDevOtpBypass` helper | Function |
| `src/routes/authentication/index.ts` | Read header, OR into `/login` branch, log | ElysiaJS autoload |

### Data Storage

None. No persistent or transient storage is added.

---

## Constraints

- No DB schema change; no Redis key; no BullMQ job; no new npm dependency (ask first per CLAUDE.md)
- New env vars only via `src/config.ts`
- Secret compared in constant time; never logged, returned, or stored
- Production (`COOKIE_SECURE === true`) hard-disables the bypass regardless of flag/header
- `POST /login` non-OTP and OTP responses stay byte-compatible for non-bypass requests

## Success Criteria

### Functional

- [ ] With flag + dev env + secret + matching header, a staff login returns cookies in one step, no email
- [ ] Any single condition off → unchanged behaviour (normal OTP path or 401)
- [ ] `COOKIE_SECURE=true` makes the bypass impossible; one startup warning when the flag is set in prod
- [ ] Wrong password → 401 even with a valid header

### Non-Functional

- [ ] Secret compared in constant time; never appears in logs or responses
- [ ] No new persistent/transient storage; no added request I/O

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 017-dev-otp-bypass | ddd-construction-bolt | 001, 002, 003 | Config + fail-closed decision helper + `/login` wiring for the guarded dev OTP bypass |
