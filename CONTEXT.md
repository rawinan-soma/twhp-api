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

### Answer Review
The Evaluator's per-answer verdict on a submitted Cover. Each Answer is in exactly one state, derived from its latest `answerLogs` row:
- **in_review** — submitted by the Factory, awaiting an Evaluator verdict.
- **rejected** — sent back by the Evaluator with a comment (`answerLogs.description`); the Factory may edit and resubmit it.
- **finished** ("**Approved**") — the Evaluator accepted the Answer. There is no separate `approved` status; approval *is* the `finished` state.

A Cover becomes **finished** only when **all** of its Answers are `finished`.
_Avoid_: "approved" as a distinct status — it maps to `finished`.

### Evaluator
A Staff Account scoped by `region` (which factories' Covers it sees) and `level`, which sets both **what it reviews** and **its authority**. Review is **hierarchical**, not peer:
- **Mental** and **DOH** — tier-1 reviewers. Each owns a fixed subset of the 5 QuestionCategories *(map pending PO)* and renders verdicts **only on its own categories**. Their submissions are **non-finalizing**.
- **ODPC** — the final reviewer. Accesses **all** categories, evaluates the categories no tier-1 level owns ("the rest"), and may **backstop** any owned-category Answer that Mental/DOH left `in_review`. ODPC is the **sole finalizer** — only ODPC's action transitions the Cover and returns the result to the Factory.

**Override rule:** no Evaluator can change an Answer that already has a verdict. Any Evaluator may only act on an Answer whose latest log is `in_review`; `finished`/`rejected` Answers are immutable to Evaluators (only the Factory reopens a `rejected` one by editing it). This is how ODPC "cannot override" Mental/DOH.

### Evaluator Verdict
An Evaluator commits a **single batch** — one payload of verdicts (approve / reject + comment) over the `in_review` Answers it is allowed to act on. The server writes all `answerLogs` rows **atomically in one transaction**; no partial/per-answer save. The acting evaluator is recorded via `answerLogs.eval_id` and `coverLogs.evaluatorId`.

- **Tier-1 (Mental/DOH) batches are non-finalizing** — they record `finished`/`rejected` on their categories but leave the Cover `in_review`.
- **ODPC's batch finalizes.** ODPC may also clear any Answer still `in_review` (backstop authority over unfinished tier-1 work). Finalization is only valid when **no Answer remains `in_review`** after ODPC's batch. Then the transition is computed across the **whole** Cover:
  - All Answers `finished` → Cover `finished`.
  - Any Answer `rejected` → Cover `in_progress` (back to factory).

Because **only ODPC writes the `coverLogs` transition** and the Factory never holds the Cover while an Evaluator is active, there is no factory↔evaluator race and no cover-status race — the elaborate concurrency locking considered for a peer model is unnecessary here.

### Re-evaluation Loop
The cycle when ODPC finalizes with ≥1 `rejected` Answer:
1. ODPC's finalize leaves ≥1 Answer `rejected` → **Cover → `in_progress`**, returning the consolidated rejections to the Factory. (At this point every Answer is `finished` or `rejected` — none `in_review`.)
2. Factory edits the `rejected` Answers (editing flips them back to `in_review`). **`finished` Answers are locked** — the Factory cannot edit an approved Answer.
3. Factory re-submits → Cover returns to `in_review`. Re-submission is allowed when **no Answer is still `rejected`** (replacing the old "all Answers `in_review`" rule, which a partially-approved Cover would fail).
4. The owning tier-1 level re-judges its re-submitted Answers (or ODPC backstops); **approved (`finished`) Answers carry over** and are not re-reviewed (sticky approvals). ODPC finalizes again.
5. Iterate until all Answers are `finished` → Cover `finished`.

## Flagged ambiguities

- **Can an Evaluator re-open a previously approved (`finished`) Answer?** Under the sticky-approval model, approved Answers are locked once `finished`. **Pending PO decision** — if re-opening is required, the model needs an Evaluator-side action to revert `finished → in_review` (or `rejected`).
- **Email notifications needed?** v1 proposes state-visibility only (no email). **Pending PO** — if the Factory must be actively emailed when ODPC sends results back (and/or Evaluators when a Factory submits), this adds new BullMQ `email` job types + templates and widens the login-critical email-worker surface flagged in ADR-0002.
- **`level → category` ownership map (tier-1).** Which of the 5 QuestionCategories (`Collaborate | Disease | Safety | Mental | Outcome`) **Mental** owns and which **DOH** owns is **pending PO decision**. ODPC owns "the rest" (categories no tier-1 level claims) and has all-category access regardless, so only the Mental/DOH split needs confirming. Likely `Mental → Mental`, but the DOH set and any remainder are unconfirmed.

## Review Endpoints

Evaluator-facing, under `evalGuard`. The verdict endpoint is **level-aware** — the service reads the caller's `level` (via `evaluatorService.helper.getEvaluatorData`) and applies the tier-1 vs ODPC rules.

| Endpoint | Caller | Behaviour |
|----------|--------|-----------|
| `GET /twhp/api/evaluators/covers/:coverId/answers` | Any Evaluator (region-scoped) | Each Answer with current status, question + category, and existing verdict/comment. Mental/DOH see their own categories; ODPC sees all. |
| `POST /twhp/api/evaluators/covers/:coverId/verdict` | Any Evaluator | Batch of `{ answerId, decision: approve\|reject, comment? }` over `in_review` Answers the caller may act on. Tier-1 (Mental/DOH) → records verdicts, Cover stays `in_review` (non-finalizing). ODPC → records + **finalizes**: requires no Answer left `in_review`, then all `finished` → Cover `finished`, any `rejected` → Cover `in_progress`. One transaction. |

**v1 scope (proposed):** state-visibility only — "sent to evaluators / factory" means the Cover surfaces in the other party's list endpoint; **no email notifications** by default (keeps the feature off the login-critical email worker — see ADR-0002). **Whether email notifications are required is pending PO** (see Flagged ambiguities). A `reject` requires a `comment`; `approve` does not. After ODPC finalizes to `finished`, the **existing** factory score endpoint (`GET /twhp/api/factories/assessments/score`) is the final-score report — no new score work (ADR-0001).

## Score Endpoints

| Role | Path | Scope |
|------|------|-------|
| Factory | `GET /twhp/api/factories/assessments/score` | Own Cover |
| Evaluator | `GET /twhp/api/evaluators/score` | All Covers in evaluator's region |
| Provincial Officer | `GET /twhp/api/provincialOfficers/score` | All Covers in officer's province |
| Admin (DOED) | `GET /twhp/api/admins/score` | All Covers (optional `?region=` / `?provinceId=` filters) |
