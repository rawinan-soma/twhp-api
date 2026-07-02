---
id: 003-login-route-wiring
unit: 001-dev-otp-bypass
intent: 006-dev-otp-bypass
status: complete
priority: must
created: 2026-06-23T00:00:00.000Z
assigned_bolt: 017-dev-otp-bypass
implemented: true
---

# Story: 003-login-route-wiring

## User Story

**As a** developer or QA engineer
**I want** to send `X-Dev-Bypass: <secret>` with my `/login` request and get a session without OTP
**So that** I can log in as any staff role locally without running the email worker — while production and normal logins are untouched

## Acceptance Criteria

- [ ] **Given** the bypass is active and a **correct** staff password, **When** `POST /login` is called with `X-Dev-Bypass: <secret>`, **Then** `Authentication` + `Refresh` cookies are set, `hashedRefreshToken` is persisted, and `{ message, user }` is returned — identical to the existing non-OTP path
- [ ] **Given** the bypass is active, **When** the staff login succeeds via the bypass, **Then** no `2fa:challenge:*` / `2fa:active:*` Redis key is created and no `2fa-otp` email job is enqueued
- [ ] **Given** a **wrong** password, **When** `POST /login` is called with a valid `X-Dev-Bypass` header, **Then** `401 "invalid username or password"` is returned with no cookies (credential check runs first)
- [ ] **Given** no header (or a wrong/empty header), **When** an OTP-required staff logs in, **Then** the response is the unchanged `{ twoFactorRequired, challengeId, email(masked) }` with no cookies
- [ ] **Given** the bypass applies, **When** any of `DOED` / `Evaluator` / `Provincial` logs in, **Then** all three yield the same response shape and cookie set as a one-step login (no dev marker in the session)
- [ ] **Given** the bypass fires, **When** the login completes, **Then** one structured log entry attributes the OTP skip to the account; the secret never appears in logs
- [ ] **Given** the OpenAPI document, **When** `/login` is rendered, **Then** the optional `X-Dev-Bypass` header is documented as dev-only

## Technical Notes

- In `src/routes/authentication/index.ts`, destructure `headers` (or `request.headers`) in the
  `/login` handler and read `x-dev-bypass` (header names are lower-cased by Elysia).
- Change the branch at line ~22 from
  `if (!authenticationService.requiresOtp(account.role, account.isChangePassword))`
  to also OR in the bypass:
  `const devBypass = authenticationService.isDevOtpBypass(headers["x-dev-bypass"]);`
  `if (!authenticationService.requiresOtp(...) || devBypass) { …issue cookies… }`
- **Reuse the exact existing cookie/token issue + `setRefreshToken` block** — do not duplicate
  shape; the bypass path must be byte-compatible with the current non-OTP response.
- Emit the bypass-usage log only inside the `devBypass === true` case (avoid noise on normal logins).
- Add the header to the route's `detail`/OpenAPI metadata as an optional, dev-only header; mark
  it clearly so it is obvious it is not for production clients.
- Do **not** touch `/login/verify-otp` or `/login/resend-otp`.

## Dependencies

### Requires

- 001-bypass-config
- 002-bypass-decision-helper

### Enables

- None (final story — feature complete after this)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Factory login with the header present | Unchanged — Factory is already non-OTP; header is a no-op |
| Account already has an active `2fa:active` challenge, then logs in with bypass | Bypass issues cookies directly; stale challenge simply expires (not consulted) |
| Locked account (`2fa:fail ≥ threshold`) logs in with bypass | Bypass path does not consult the lockout counter — login succeeds (dev convenience) |
| Header present but `requiresOtp` already false (first-login staff) | One-step login as today; bypass branch is simply also true (no double issue) |

## Out of Scope

- Env var declarations (001) and the decision helper internals (002)
- Any change to the OTP challenge/verify/resend mechanics
