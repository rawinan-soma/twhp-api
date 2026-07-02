---
intent: 006-dev-otp-bypass
phase: inception
status: complete
created: 2026-06-23T00:00:00.000Z
updated: 2026-06-23T00:00:00.000Z
---

# Requirements: Developer OTP Bypass for Staff Login

## Intent Overview

Provide a **development-only login path that skips the email-OTP second factor** for staff
accounts, so engineers and QA can authenticate without waiting on (or running) the email
worker. The bypass is opt-in per request via a **secret header** (`X-Dev-Bypass`), is
**master-switched by an env flag** (`DEV_SKIP_OTP`), and is **hard-disabled in production**
regardless of configuration. Credentials are still verified — the header only removes the
OTP step, never the password check.

This is an **Enhancement** to the staff Email-OTP 2FA flow ([[002-staff-2fa]]). The single
integration seam is the non-OTP branch of `POST /login`
(`src/routes/authentication/index.ts:22`), which today fires when
`requiresOtp(role, isChangePassword)` is `false`.

**Type**: Enhancement (brown-field — adds a guarded dev bypass to existing authentication).

## Business Goals

| Goal | Success Metric | Priority |
|------|---------------|----------|
| Let developers/QA log in as any staff role without OTP friction in local/dev | A staff login on `/login` with a valid `X-Dev-Bypass` header in a dev environment returns cookies in one step, no email sent | Must |
| Make it structurally impossible to weaken production auth | With production signal active, the bypass never fires even if the flag and header are present; a startup warning is logged | Must |
| Add zero risk to the normal login surface | A request without the header (or with a wrong header) is byte-for-byte identical to today's behavior | Must |

---

## Functional Requirements

### FR-1: Header-Gated OTP Bypass on `/login`

- **Description**: When all activation conditions hold (FR-2), a correct staff
  username/password on `POST /login` completes immediately on the existing **non-OTP code
  path** — issue `Authentication` + `Refresh` cookies, persist `hashedRefreshToken`, and
  return the standard `{ message, user }` shape. No 2FA challenge is minted and no `2fa-otp`
  email is enqueued.
- **Acceptance Criteria**: Given `DEV_SKIP_OTP=true`, a non-production environment, a
  configured secret, and a request carrying a matching `X-Dev-Bypass` header with a correct
  staff password → response sets both cookies and returns `{ message, user }`; Redis has no
  new `2fa:challenge:*` / `2fa:active:*` key and no `2fa-otp` job is queued.
- **Priority**: Must
- **Related Stories**: _to be defined (bypass-decision helper; route wiring)_

### FR-2: Multi-Condition Activation Gate (Fail-Closed)

- **Description**: The bypass activates for a request **only if ALL** of the following are
  true. If any is false, the request falls through to the **unchanged** normal flow.
  1. `DEV_SKIP_OTP === true`
  2. Production is **not** detected (FR-3)
  3. `DEV_BYPASS_SECRET` is configured and non-empty
  4. Request header `X-Dev-Bypass` is present and equals `DEV_BYPASS_SECRET`
  5. The username/password check has already succeeded
- **Acceptance Criteria**: Flipping any single condition off disables the bypass: missing
  flag → normal flow; unset secret → normal flow (fail-closed); absent/mismatched header →
  normal OTP flow (staff receive `{ twoFactorRequired, challengeId, email }`). The decision
  is centralized in one service helper so the route has a single branch change.
- **Priority**: Must
- **Related Stories**: _to be defined_

### FR-3: Production Hard-Block

- **Description**: When the production signal is active the bypass is **forcibly disabled**,
  ignoring `DEV_SKIP_OTP` and any header. The production signal is **`COOKIE_SECURE === true`**
  (already required in `src/config.ts`; `true` only in real HTTPS deployments, `false`
  locally). If `DEV_SKIP_OTP=true` while `COOKIE_SECURE=true`, the app logs a **single
  warning at startup** that the dev OTP bypass is configured-but-ignored in production.
- **Acceptance Criteria**: With `COOKIE_SECURE=true`, no combination of `DEV_SKIP_OTP`,
  `DEV_BYPASS_SECRET`, and `X-Dev-Bypass` skips OTP — staff always get the challenge path; a
  warning line is emitted exactly once at boot when the flag is set in production.
- **Priority**: Must
- **Related Stories**: _to be defined_

### FR-4: Credentials Still Required (Header Is Not an Auth Bypass)

- **Description**: The `X-Dev-Bypass` header skips **only the OTP factor**. The normal
  `getAutheticatedAccount(username, password)` credential check runs first and unchanged; a
  wrong password returns `401` exactly as today, with no cookies, regardless of the header.
- **Acceptance Criteria**: A request with a valid `X-Dev-Bypass` header but a wrong password
  → `401 "invalid username or password"`, no cookies, no session. The header alone grants
  nothing.
- **Priority**: Must
- **Related Stories**: _to be defined_

### FR-5: Scope — All Staff Roles, Identical Output

- **Description**: When active, the bypass applies to **all staff roles**
  (`DOED`, `Evaluator`, `Provincial`). `Factory` is already OTP-free and is unaffected. The
  issued cookies, token claims, and `{ message, user }` payload are **identical** to the
  existing non-OTP login path (no special dev marker in the session).
- **Acceptance Criteria**: A bypassed `DOED`, `Evaluator`, and `Provincial` login each yield
  the same response shape and cookie set as a Factory/first-login one-step login today;
  resulting sessions behave identically (including silent refresh rotation).
- **Priority**: Must
- **Related Stories**: _to be defined_

### FR-6: Configuration & Startup Validation

- **Description**: Two new **optional** env vars, validated in `src/config.ts` alongside the
  existing `OTP_*` block:
  - `DEV_SKIP_OTP` — optional boolean, default `false` (master switch).
  - `DEV_BYPASS_SECRET` — optional string, default empty (the value `X-Dev-Bypass` must
    match). An empty/unset secret means the bypass can never activate (fail-closed, FR-2.3).
  No `Bun.env` reads happen outside `config.ts`.
- **Acceptance Criteria**: App boots with neither var set (defaults: bypass off). Setting
  `DEV_SKIP_OTP=true` with an empty `DEV_BYPASS_SECRET` does **not** enable the bypass. A
  malformed boolean for `DEV_SKIP_OTP` throws at startup (consistent with `requireEnvBoolean`
  semantics applied to the optional helper).
- **Priority**: Must
- **Related Stories**: _to be defined_

### FR-7: Observability of Bypass Usage

- **Description**: Each time the bypass actually fires for a login, emit a log line
  identifying the account (e.g. account id / username) and that OTP was skipped via the dev
  header. The secret value is **never** logged. (Forward-looks to the audit-logging intent
  [[005-network-and-audit-logging]], but a structured log entry is sufficient for v1.)
- **Acceptance Criteria**: A successful bypass produces one log entry attributing the OTP
  skip to the account; greps of logs/Redis never reveal `DEV_BYPASS_SECRET`.
- **Priority**: Should
- **Related Stories**: _to be defined_

---

## Non-Functional Requirements

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Secret comparison | Constant-time | Compare `X-Dev-Bypass` to `DEV_BYPASS_SECRET` with a timing-safe equality (e.g. `crypto.timingSafeEqual`) to avoid a timing oracle |
| Fail-closed | Default-deny | Unset/empty secret, unset flag, or production signal → bypass impossible |
| Production isolation | Hard-block | `COOKIE_SECURE === true` disables the bypass unconditionally (FR-3) |
| Secret hygiene | No leakage | Secret never logged, never returned in any response, never written to Redis |
| Blast radius | OTP-only | Header removes the second factor only; password verification is untouched (FR-4) |

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Added per-login overhead | Extra latency on `/login` | Negligible (one header read + constant-time string compare; no I/O) |

### Reliability / Compatibility

| Requirement | Metric | Target |
|-------------|--------|--------|
| Normal-flow invariance | Behavior of requests without a matching header | Byte-for-byte identical to current `/login` (both OTP and non-OTP paths) |
| No new infra | New dependencies / services | None — reuse existing config, route, and `node:crypto` |

### Maintainability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Single decision point | Bypass logic location | One service helper (e.g. `isDevOtpBypass(headerValue)`); route gets a one-line branch change |

---

## Constraints

### Technical Constraints

**Project-wide standards**: loaded from `memory-bank/standards/` by the Construction Agent.

**Intent-specific constraints**:

- The only route touched is `POST /login`; the bypass ORs into the existing
  `!requiresOtp(...)` branch — the verify-otp and resend-otp endpoints are untouched.
- No DB schema change; no new Redis keys; no change to token/cookie issuance helpers.
- New env vars must be declared and validated in `src/config.ts` (no direct `Bun.env`
  elsewhere), mirroring the `OTP_*` optional-var pattern.
- Use `node:crypto` (already imported in `authentication.ts`) for the timing-safe compare —
  no new dependency.

### Business Constraints

- Strictly a developer/QA convenience — it must never become a production login path.
- No frontend change is required to log in normally; the header is supplied only by
  developer tooling / API clients.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|----------------|-----------|
| `COOKIE_SECURE === true` reliably marks production (HTTPS) and `false` marks local/dev | Bypass could be reachable in a misconfigured "prod" running `COOKIE_SECURE=false` | Document the coupling; consider a dedicated `APP_ENV` later (Open Question); startup warning covers the inverse case |
| Developers can set request headers in their tooling (curl/Postman/dev frontend) | Bypass unusable if header can't be sent | Header approach was explicitly chosen; documented in API docs |
| The dev secret is kept out of source control (`docker.env` / local env only) | Leaked secret lets anyone in a dev env skip OTP | Secret is dev-only and production-blocked; rotate via env; never logged |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|-----------|
| Activation mechanism (env auto vs dev endpoint vs secret header) | rawinan | 2026-06-23 | Resolved — **secret header `X-Dev-Bypass` on `/login`** (Checkpoint 1) |
| Account scope | rawinan | 2026-06-23 | Resolved — **all staff roles** (Checkpoint 1) |
| Production safety | rawinan | 2026-06-23 | Resolved — **hard-block in production** (Checkpoint 1) |
| Production signal: reuse `COOKIE_SECURE` vs introduce explicit `APP_ENV` | rawinan | 2026-06-23 | Resolved — **reuse `COOKIE_SECURE === true`** (no new var); approved at Checkpoint 2 |
