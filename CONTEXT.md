# Domain Context

## Glossary

### Staff Account
An internal `accounts` row whose role is `DOED`, `Evaluator`, or `Provincial` — the three privileged tiers with cross-factory data visibility (DOED: all factories; Evaluator: one region; Provincial: one province). Distinguished from a **Factory** account, which is external and sees only its own Cover. Two-Factor Authentication applies to Staff Accounts only; Factory accounts are out of scope.

### Two-Factor Authentication (2FA)
A mandatory second login step for every Staff Account, delivered as an **Email OTP**: a one-time numeric code emailed to the account's `email` after a correct password. Login only succeeds once the code is verified. State is held entirely in Redis (mirroring the password-reset token pattern) — there is no database column and no per-user enrollment.

**First-login exemption:** Evaluator and Provincial accounts set their real `email` during their first-login password change (`editFirstPassword`, gated by `isChangePassword`). While `isChangePassword === false`, that login bypasses OTP so the code is never sent to a placeholder address. From the second login onward, OTP is enforced. DOED accounts have no first-login flow and are subject to OTP from the start.

### 2FA Challenge
The server-side pending state created after a correct staff password but before OTP verification. Held only in Redis at `2fa:challenge:{challengeId}` as `{ accountId, codeHash, attempts }` with a 5-minute TTL. The `challengeId` (opaque random string) is returned in the `/login` response body; no auth cookie exists until the challenge is satisfied, so a Challenge can never be mistaken for a real session. A successful verify deletes the key (single-use). The OTP is a 6-digit numeric code, stored hashed (`Bun.SHA256`), never in plaintext.

**Attempt limits:** 5 wrong codes destroy the Challenge (forcing a fresh login). At most one active Challenge per account; re-issuing is throttled to once per 60s. After 10 cumulative failed codes within 15 minutes, 2FA is locked for that account for 15 minutes.

## Authentication Endpoints

Login is a two-step flow for Staff Accounts; Factory and first-login staff complete in one step.

| Endpoint | Body | Behaviour |
|----------|------|-----------|
| `POST /login` | `{ username, password }` | Factory / first-login staff → set `Authentication`+`Refresh` cookies, return `{ message, user }`. Normal staff → no cookies, return `{ twoFactorRequired: true, challengeId, email }` (email masked, e.g. `r****@gmail.com`) and queue the OTP email. |
| `POST /login/verify-otp` | `{ challengeId, code }` | Verify code against the 2FA Challenge → set cookies, return `{ message, user }` (same shape as one-step login). `400` invalid/expired challenge · `401` wrong code · `429` locked. |
| `POST /login/resend-otp` | `{ challengeId }` | Re-send the existing code, throttled to once per 60s (`429` otherwise). |

The OTP email is delivered via the existing BullMQ `email` queue (new `2fa-otp` job, higher priority than bulk jobs) — so the email worker is now login-critical for staff.

### Cover
One assessment instance per factory enrollment per fiscal year. Created by the factory, progresses through statuses: `in_progress → in_review → finished`. A Cover is the unit of scoring.

### Score
A calculated metric for a Cover. Derived on-demand from the Cover's Answers — never persisted. Only available when the Cover's latest status is `in_review` or `finished`; requesting a score for an `in_progress` Cover returns an error.

**Formula:** `sum(choice_points) / (3 × non_na_count) × 100%`

| selectedChoice | Points |
|---------------|--------|
| `"3"` | 3 |
| `"2"` | 2 |
| `"1"` | 1 |
| `"0"` | 0 |
| `"n/a"` | excluded from numerator and denominator |

### Category Score
A Score scoped to one QuestionCategory (`Collaborate`, `Disease`, `Safety`, `Mental`, `Outcome`). Calculated using the same formula, restricted to answers whose question belongs to that category.

### Score Report
The full response object returned by the score endpoints. Contains:
- `factoryId`, `factoryNameTh`, `coverId`, `coverStatus`, `enrollId`
- `totalScore` — overall Score for the Cover
- Per-category scores: `collaborate`, `disease`, `safety`, `mental`, `outcome`

For list endpoints (Evaluator, Provincial Officer, Admin), the response is an array of Score Reports.

### Question
An assessment item with a `category` (QuestionCategory) and a `special` integer. The `special` field controls file-upload behavior only — it has no effect on scoring.

## Score Endpoints

| Role | Path | Scope |
|------|------|-------|
| Factory | `GET /twhp/api/factories/assessments/score` | Own Cover |
| Evaluator | `GET /twhp/api/evaluators/score` | All Covers in evaluator's region |
| Provincial Officer | `GET /twhp/api/provincialOfficers/score` | All Covers in officer's province |
| Admin (DOED) | `GET /twhp/api/admins/score` | All Covers (optional `?region=` / `?provinceId=` filters) |
