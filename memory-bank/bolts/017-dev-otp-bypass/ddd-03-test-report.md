---
stage: test
bolt: 017-dev-otp-bypass
created: 2026-06-23T04:27:07Z
---

## Test Report: 001-dev-otp-bypass

Tests are derived from **story acceptance criteria only** (DDD Stage 5 rule). Each test name
references the story + AC it covers. Runner: `bun test` (Bun's built-in; the project's
`package.json` `test` script is still a stub, so suites are run by path).

### Summary

- **Unit Tests (story 002 — `isDevOtpBypass`)**: 6/6 passed — `src/service/auth-dev-bypass.test.ts`
- **Config Tests (story 001 — env vars)**: 4/4 passed — `src/config.test.ts`
- **Integration Tests (story 003 + regression 006–009)**: 22/22 passed — `src/routes/authentication/index.test.ts`
  - of which **5 new** for story 003; **17 pre-existing** (006/007/008/009) still green after adding `isDevOtpBypass` to the service mock
- **Security Tests**: covered within the above (production hard-block, fail-closed, constant-time/length-guard, credentials-first)
- **Performance Tests**: not applicable — bypass adds no I/O (one header read + constant-time compare); covered by design (NFR)

**Total: 32/32 passed.**

### How heavy imports were handled

- The service unit test mocks `../config`, `../utils`, `../queue/email`, `../drizzle` so importing
  the **real** `authenticationService` does not eagerly open Redis/BullMQ/PG connections. A mutable
  `fakeEnv` drives every branch (the helper reads `env` at call-time).
- The config test loads the **real** `src/config.ts` in a child `bun` process (`process.execPath`)
  with a controlled environment per case — `config.ts` does pure validation, no network I/O.
- The two files that both touch the authentication module are run in **separate `bun test`
  invocations** to avoid `mock.module` global leakage (route test mocks the service; unit test
  imports it for real).

### Acceptance Criteria Validation

**Story 001 — bypass-config**
- ✅ **001-AC-1 — defaults unset → `DEV_SKIP_OTP=false`, `DEV_BYPASS_SECRET=""`**: pass
- ✅ **001-AC-1b — `DEV_SKIP_OTP=true` parsed boolean; secret captured**: pass
- ✅ **001-AC-2 — malformed `DEV_SKIP_OTP=yes` → startup throws (non-zero exit, names var)**: pass
- ✅ **001-AC-3 — flag true + empty secret still boots (fail-closed downstream)**: pass
- ⚠️ **001-AC (prod startup warning / no-warning in dev)**: verified by inspection — the warning lives in `src/index.ts` and emitting it requires booting the server (`app.listen`); not unit-tested to avoid a live boot. Logic is a single `if (env.DEV_SKIP_OTP && env.COOKIE_SECURE)` guard.

**Story 002 — bypass-decision-helper**
- ✅ **002-AC-1 — flag on + dev + secret + matching header → true**: pass
- ✅ **002-AC-2 — `COOKIE_SECURE=true` → false even with correct secret (prod hard-block)**: pass
- ✅ **002-AC-3 — `DEV_SKIP_OTP=false` → false**: pass
- ✅ **002-AC-4 — empty configured secret → false for any header (fail-closed)**: pass
- ✅ **002-AC-5 — undefined / empty / mismatched header → false**: pass
- ✅ **002-AC-6 — length-mismatch header → false without throwing (constant-time guard)**: pass

**Story 003 — login-route-wiring**
- ✅ **003-AC-1 — bypass active + correct staff password → 200 `{message,user}`, tokens issued, no challenge/email**: pass
- ✅ **003-AC-2 — no challenge / no `2fa-otp` email on bypass**: pass (asserted via `createChallenge` call count 0 in 003-AC-1)
- ✅ **003-AC-3 — wrong password + valid header → 401, no tokens, bypass not consulted (creds first)**: pass
- ✅ **003-AC-4 — no header + OTP-required staff → unchanged `twoFactorRequired` path**: pass
- ✅ **003-AC-5 — bypass yields identical `{message,user}` shape for DOED/Evaluator/Provincial**: pass
- ✅ **003-wiring — header value reaches `isDevOtpBypass`**: pass (asserts the helper is called with the header value)
- ⚠️ **003-AC-6 — `OtpBypassed` log on bypass**: verified by inspection — the test harness mounts the route without the `@bogeychan/elysia-logger` plugin, so context `log` is undefined and `log?.warn(...)` is a safe no-op; emission/redaction confirmed by code review (no secret in payload).
- ⚠️ **003-AC-7 — OpenAPI documents the optional `X-Dev-Bypass` header**: verified by inspection — declared via the route `headers` TypeBox schema; surfaces in the live `/twhp/api/document`. Static `docs/api/*` snapshots are a separate regen step.

### Regression

- ✅ All 17 pre-existing `/login`, `/login/verify-otp`, `/login/resend-otp`, and validation tests
  (006/007/008/009) pass unchanged after adding `isDevOtpBypass` to the route test's service mock —
  confirms the new branch did not alter existing behaviour.

### Issues Found

- None. One implementation footgun was pre-empted: `crypto.timingSafeEqual` throws on unequal
  buffer lengths — guarded by an explicit length check (002-AC-6 confirms no throw).

### Recommendations

- **Wire a test script**: `package.json` `test` is still a stub. Consider `"test": "bun test"` so
  CI runs these suites (the bolt added them but did not change the script — out of scope here).
- **Regenerate static API docs** (`docs/api/*`) so the committed OpenAPI reflects the new header.
- **Optional hardening** (deferred): compare SHA-256 digests instead of raw buffers to also hide
  secret length; and/or migrate the production signal to an explicit `APP_ENV` per ADR-4 if a
  non-HTTPS production tier ever appears.
