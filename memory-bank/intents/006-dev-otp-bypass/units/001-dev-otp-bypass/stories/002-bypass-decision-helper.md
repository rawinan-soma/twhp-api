---
id: 002-bypass-decision-helper
unit: 001-dev-otp-bypass
intent: 006-dev-otp-bypass
status: complete
priority: must
created: 2026-06-23T00:00:00.000Z
assigned_bolt: 017-dev-otp-bypass
implemented: true
---

# Story: 002-bypass-decision-helper

## User Story

**As a** maintainer of the auth flow
**I want** the entire bypass decision in one fail-closed, constant-time helper
**So that** the route has a single trivial branch and the security-critical logic is centralized and reviewable

## Acceptance Criteria

- [ ] **Given** `DEV_SKIP_OTP=true`, `COOKIE_SECURE=false`, a non-empty `DEV_BYPASS_SECRET`, and a header value equal to the secret, **When** `isDevOtpBypass(header)` is called, **Then** it returns `true`
- [ ] **Given** `COOKIE_SECURE=true` (production), **When** `isDevOtpBypass(header)` is called with any header (even the correct secret), **Then** it returns `false` (production hard-block)
- [ ] **Given** `DEV_SKIP_OTP=false`, **When** called, **Then** returns `false`
- [ ] **Given** `DEV_BYPASS_SECRET` is empty/unset, **When** called with any header (including empty), **Then** returns `false` (fail-closed)
- [ ] **Given** a `header` that is `undefined`, empty, or not equal to the secret, **When** called, **Then** returns `false`
- [ ] **Given** the secret comparison, **When** comparing `header` to `DEV_BYPASS_SECRET`, **Then** a constant-time comparison is used (no early-exit / length oracle)

## Technical Notes

- Add `isDevOtpBypass(headerValue: string | undefined): boolean` to `authenticationService`
  in `src/service/authentication.ts` (pure function — no I/O, no Redis, no DB).
- Order the cheap guards first, then the constant-time compare last:
  1. `if (!env.DEV_SKIP_OTP) return false`
  2. `if (env.COOKIE_SECURE) return false`  // production hard-block (FR-3)
  3. `if (!env.DEV_BYPASS_SECRET) return false`  // fail-closed (FR-2.3)
  4. `if (!headerValue) return false`
  5. constant-time equality of `headerValue` vs `env.DEV_BYPASS_SECRET`
- Use `node:crypto` `timingSafeEqual` over `Buffer`s; guard the length-mismatch case
  (`timingSafeEqual` throws on unequal lengths) without leaking timing — e.g. compare against a
  fixed-length digest or short-circuit on a length check that does not reveal the secret. The
  helper already imports from `node:crypto` (`randomBytes`).
- Never log `headerValue` or `env.DEV_BYPASS_SECRET`.

## Dependencies

### Requires

- 001-bypass-config (provides `env.DEV_SKIP_OTP`, `env.DEV_BYPASS_SECRET`, `env.COOKIE_SECURE`)

### Enables

- 003-login-route-wiring (consumes the helper)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Header longer/shorter than secret | `false`, without throwing and without a timing leak |
| Correct secret but `DEV_SKIP_OTP=false` | `false` (master switch wins) |
| Correct secret in production (`COOKIE_SECURE=true`) | `false` (hard-block wins) |
| Whitespace-padded header | `false` unless it exactly equals the secret (no trimming) |

## Out of Scope

- Reading the header from the request / wiring into the route (003)
- The env var declarations themselves (001)
