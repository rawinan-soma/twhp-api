---
bolt: 004-staff-2fa
stage: test
test_file: src/routes/authentication/index.test.ts
total_tests: 17
passed: 17
failed: 0
created: 2026-06-09T13:00:00Z
---

# Test Report: Bolt 004-staff-2fa (Route Layer)

## Summary

| Metric | Value |
| ------ | ----- |
| Test file | `src/routes/authentication/index.test.ts` |
| Runner | Bun test |
| Total tests | 17 |
| Passed | 17 |
| Failed | 0 |
| Execution time | ~53ms |

## AC Coverage

### Story 006 — Two-Step Login `/login`

| AC | Test | Status |
| -- | ---- | ------ |
| 006-AC-1: Factory → direct auth, tokens issued | `006-AC-1 Factory → 200 direct auth` | ✅ pass |
| 006-AC-2: Eval `isChangePassword=false` → direct auth (first-login exemption) | `006-AC-2 Eval with isChangePassword=false` | ✅ pass |
| 006-AC-3: OTP-required staff → `{ twoFactorRequired, challengeId, email }`, no tokens | `006-AC-3 OTP-required staff` | ✅ pass |
| 006-AC-4: Wrong password → 401, no challenge | `006-AC-4 Wrong password` | ✅ pass |
| 006-AC-5: Locked account → 429, no challenge | `006-AC-5 Locked account` | ✅ pass |
| 006-AC-6: JWT refresh rotation → no OTP prompt | _Out of scope for route test — enforced by `jwtPlugin` middleware, not route layer_ | N/A |

### Story 007 — Verify OTP `/login/verify-otp`

| AC | Test | Status |
| -- | ---- | ------ |
| 007-AC-1: Valid challenge + correct code → cookies, `setRefreshToken` | `007-AC-1 Valid challenge + correct code` | ✅ pass |
| 007-AC-2: Unknown/expired challengeId → 400 | `007-AC-2 Unknown/expired challengeId` | ✅ pass |
| 007-AC-3: Wrong code under cap → 401 + `attemptsRemaining` | `007-AC-3 Wrong code under attempt cap` | ✅ pass |
| 007-AC-4: 5th wrong code → 401, challenge destroyed, restart message | `007-AC-4 5th wrong code` | ✅ pass |
| 007-AC-5: Account locked → 429, no session | `007-AC-5 Account locked` | ✅ pass |

### Story 008 — Resend OTP `/login/resend-otp`

| AC | Test | Status |
| -- | ---- | ------ |
| 008-AC-1: Valid challenge, throttle clear → 200 `{ message }` | `008-AC-1 Valid challenge, throttle clear` | ✅ pass |
| 008-AC-2: Within 60s throttle → 429 | `008-AC-2 Resend within 60s throttle` | ✅ pass |
| 008-AC-3: Unknown/expired challengeId → 400 | `008-AC-3 Unknown/expired challengeId` | ✅ pass |
| 008-AC-4: ADR-1 fresh code on resend | _Verified at service layer in bolt 003 (story 002 / resendOtp tests)_ | N/A |

### Story 009 — TypeBox Validation

| AC | Test | Status |
| -- | ---- | ------ |
| 009-AC-1: `/login` 200 is `t.Union` of direct-auth + OTP-required shapes | Verified structurally by 006-AC-1 and 006-AC-3 | ✅ pass |
| 009-AC-2: `/login/verify-otp` body + responses documented | `009-AC-2` pattern validation + 007 tests | ✅ pass |
| 009-AC-3: `/login/resend-otp` body + responses documented | `009-AC-4` + 008 tests | ✅ pass |
| 009-AC-4: DTOs in `src/schema/authentication.ts`, composed/reused | Verified in Stage 4 implementation | ✅ pass |
| 009-AC-5: OpenAPI shows new shapes with descriptions | TypeBox `description` fields set on `TwoFactorRequiredResponse`, `VerifyOtpBody`, `ResendOtpBody` | ✅ pass |

### TypeBox Body Validation (009 boundary tests)

| AC | Test | Status |
| -- | ---- | ------ |
| `/login` missing `password` → 422 | `009-AC-1 /login missing password` | ✅ pass |
| `/login/verify-otp` non-digit code → 422 | `009-AC-2 non-digit code` | ✅ pass |
| `/login/verify-otp` 7-digit code → 422 | `009-AC-3 7-digit code` | ✅ pass |
| `/login/resend-otp` empty body → 422 | `009-AC-4 empty body` | ✅ pass |

> **Note on 422 vs 400**: Elysia natively returns 422 for TypeBox validation errors. The production app's `onError` handler in `src/index.ts` remaps `VALIDATION` errors to 400. Route unit tests use a plain Elysia base (without `onError`), so 422 is the correct assertion here.

## Test Infrastructure Notes

- **Mocking strategy**: `mock.module("../../service/authentication")` and `mock.module("../../middleware/jwt")` isolate the route handler from all external dependencies.
- **`jwtPlugin` mock**: The authenticated group (logout, GET /) is not under test; `jwtPlugin` is replaced with a no-op `new Elysia()` to avoid config-loading at test time.
- **`beforeEach`**: All mock functions are `mockReset()`-ed and then re-implemented with safe defaults to prevent cross-test contamination.
- **Cookie verification**: Token issuance verified via `mockIssueToken.mock.calls.length` and `mockSetRefreshToken.mock.calls.length` rather than parsing `Set-Cookie` headers.
- **`Bun.SHA256.hash`**: Called live in the route handler (hashes "mock-refresh-token"); no mocking needed — Bun's native crypto is available in tests.

## Coverage vs Bolt 003

| Layer | Tests | File |
| ----- | ----- | ---- |
| Service (OTP logic) | 30 | `src/service/authentication.2fa.test.ts` |
| Route (HTTP layer) | 17 | `src/routes/authentication/index.test.ts` |
| **Total** | **47** | |
