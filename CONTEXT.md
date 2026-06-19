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

## Assessment & Evaluation

### Cover
One assessment instance per factory enrollment per fiscal year. Created by the factory, progresses through statuses: `in_progress → in_review → finished`. A Cover is the unit of scoring.

### Score
A calculated metric for a Cover. Derived on-demand from the Cover's Answers — never persisted. Only available when the Cover's latest status is `in_review` or `finished`; requesting a score for an `in_progress` Cover returns an error.

Each Answer contributes its **live choice** — the factory's `selectedChoice`, or an accepted [[Verdict Score]] where one has replaced it. An *unaccepted* (open) verdict does not affect the Score.

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
- `grade` — the [[Grade]] (`gold`/`silver`/`certificate`/`joined`), present **only when `coverStatus` is `finished`** (otherwise `null`). Recomputed on-demand like the score — this is the retrieval path for a Grade after the finalize email.

For list endpoints (Evaluator, Provincial Officer, Admin), the response is an array of Score Reports, each carrying `grade` for its `finished` Covers.

### Grade
The award tier derived from a `finished` Cover's scores. One of `gold`, `silver`, `certificate`, `joined`. Derived on-demand (never persisted), evaluated **strictly top-down — the first tier whose conditions all pass** (the lower tiers are *floors*, not bands, so the ordering is load-bearing):

| Grade | Conditions (all must hold) |
|-------|----------------------------|
| `gold` | Every Category Score **> 80%** · overall `totalScore` **≥ 90%** · **full score** (live choice `"3"`) on every question where `special` is `1` or `3` |
| `silver` | Every Category Score **> 60%** · overall `totalScore` **≥ 80%** |
| `certificate` | overall `totalScore` **≥ 60%** |
| `joined` | overall `totalScore` **< 60%** |

The lower tiers use overall **floors** (`≥ 80`, `≥ 60`), not closed bands — so a Cover demoted from a higher tier (e.g. missing a `gold` category/`special` gate) falls cleanly to the next tier instead of into an ungraded hole. Examples: `92%` overall with a category at `70%` → fails `gold` (category ≤ 80%) → **`silver`**; `85%` overall with a category at `55%` → fails `silver` (category ≤ 60%) → **`certificate`**; `95%` overall but a `special` question not full → **`silver`**. Note the deliberate **Silver→Certificate cliff**: a single category **≤ 60%** drops even a very-high-overall Cover to `certificate` — `silver` requires *high **and** balanced*. The Grade is meaningful **only for a `finished` Cover**, computed from each Answer's **live choice** (the factory's `selectedChoice`, or an accepted [[Verdict Score]] where one replaced it). It is returned both in the ODPC finalize response **and** in the [[Score Report]] (`grade` field, `null` for non-`finished` Covers) — the latter is how a Grade is retrieved after the finalize email. Derived on-demand, never persisted.

### Verdict Score
An Evaluator's proposed override of a single Answer's choice, recorded on `answerLogs` (`verdict_choice`, reusing the `Choices` enum **restricted to `0`/`1`/`2`/`3` — never `n/a`**) together with a mandatory `description`. The factory's original `answers.selectedChoice` is **never overwritten** — both values coexist so the UI can show "your score vs. our verdict."

- **Live choice** (what the Score/Grade calculation uses) = the most recently **accepted** choice: the factory's `selectedChoice` by default, replaced by a Verdict Score only once the Factory **accepts** it (or it is otherwise settled). An open, unaccepted verdict does not change the computed Score.
- Because `n/a` is not a valid Verdict Score, an Evaluator can pull a factory `n/a` *into* scoring (assign 0–3) but can never push a scored Answer *out* to `n/a`.
- This does **not** violate "Score never persisted" — raw choices were always persisted columns; only the computed percentage Score Report is never persisted.

Both send-back outcomes store `answerStatus = rejected` (the two send-backs reuse one status — distinct from the `recommended`/`finished` approval path); they are told apart by `verdict_choice`: **set** → change-score (factory accepts or objects), **null** → hard reject (factory must redo). `description` is **mandatory** for both; `approve` requires none.

### Negotiation Loop (score dispute)
When an Evaluator issues a **change-score** verdict, the Answer goes back to the Factory (as part of ODPC's committed batch) carrying the proposed [[Verdict Score]] + mandatory description. The Factory then either:
- **Accepts** → the Answer becomes **`recommended`** (the Verdict Score becomes the live choice), **not immediately `finished`** — ODPC's next commit converts it to `finished` (unless ODPC overrides). Accepting applies the **same per-choice file-requirement validation** as a normal answer for the resulting live choice: a downgrade (e.g. `3 → 1`) passes trivially on existing evidence, but accepting an *upward* Verdict Score the existing files don't support requires the Factory to supply the missing files (otherwise accept fails and they must object instead). Or
- **Objects** → a free **re-answer**: the Factory submits a (possibly equal, possibly different) `selectedChoice` and freely manages evidence — append into empty file slots, replace (delete + re-upload), or delete files no longer needed when lowering the score (e.g. `3 → 1` sheds level-2/3 evidence). Validated against the new choice's file requirements, reconciling MinIO (delete removed, upload added) before the txn — identical to the existing answer-edit path. The Answer returns to `in_review`; the owning level re-judges (ODPC backstops/finalizes).

This repeats **without bound**: neither side can unilaterally force the value, and there is no "new evidence required" guard. The loop terminates **only by agreement** — Factory accepts a verdict (→ `recommended`, finalized by ODPC), or an Evaluator approves the factory's standing score. A Cover cannot finish while any Answer is mid-dispute. _(Accepted trade-off: a Cover may never settle if the parties never agree — documented in ADR-0004; escalation/deadline is explicitly out of v1 scope.)_

### Question
An assessment item with a `category` (QuestionCategory) and a `special` integer. `special` controls file-upload behavior and is the gold-grade gate: every `special` `1` or `3` question must have full score (`"3"`) for `gold`. It has no effect on the Score **formula** itself.

### Answer Review
The Evaluator's per-answer verdict on a submitted Cover. Each Answer is in exactly one state, derived from its latest `answerLogs` row. The `answerStatus` enum has **four** values (`in_review`, `recommended`, `rejected`, `finished`):
- **in_review** — submitted (or re-submitted) by the Factory, awaiting an Evaluator verdict. Also the state of any Answer no evaluator has acted on yet.
- **recommended** — a **non-ODPC party signed off**, but the Answer is **not yet final**: either a **tier-1 (Mental/DOH) approve**, or the **Factory accepted** a [[Verdict Score]]. It is **still overridable by ODPC** and only becomes `finished` when ODPC commits. (This is why tier-1 is genuinely *non-finalizing* — see [[Evaluator]].)
- **rejected** — sent back by an Evaluator (`description` **mandatory**). Two sub-kinds, told apart by `answerLogs.verdict_choice`:
  - **change-score** (`verdict_choice` set, `0–3`) — the Evaluator proposes a corrected score; the Factory **accepts or objects** (see [[Negotiation Loop]]). Files are **preserved**.
  - **hard reject** (`verdict_choice` null) — the Answer is invalid; the Factory must **redo** it. Files are **deleted** from MinIO at ODPC's batch commit.
- **finished** — terminal. **Only ODPC's commit writes `finished`** (by approving directly, or converting a `recommended` Answer it doesn't override). **`finished` is immutable to everyone — including ODPC.**

A Cover becomes **finished** only when **all** of its Answers are `finished` (which, since only ODPC writes `finished`, can only happen at an ODPC commit).
_Avoid_: "approved" as a distinct status — a tier-1/factory approval is `recommended`, an ODPC approval is `finished`. _Avoid_: treating change-score as a distinct status — it is `rejected` + a `verdict_choice`.

### Evaluator
A Staff Account scoped by `region` (which factories' Covers it sees) and `level`, which sets both **what it reviews** and **its authority**. Review is **hierarchical**, not peer:
- **Mental** and **DOH** — tier-1 reviewers. Category ownership: **DOH** → `Disease`, `Safety`; **Mental** → `Mental`. Each renders verdicts only on its own categories. Tier-1 Evaluators **may edit their own previously submitted verdicts** at any time. Their submissions are **non-finalizing** — a tier-1 approve writes `recommended` (not `finished`), so ODPC can still override it.
- **ODPC** — the final reviewer. Primary categories: `Collaborate`, `Outcome`. Holds **full override authority over all categories** — within its finalize batch it may rewrite any non-`finished` verdict (re-score a change-score, flip a reject to approve, override a tier-1 `recommended`, etc.) and backstops any Answer still `in_review`. ODPC is the **sole finalizer** — **only ODPC's commit writes `finished`** and transitions the Cover.

**Override rule:** A tier-1 Evaluator (Mental/DOH) may edit verdicts they themselves submitted, but **only while the Cover is `in_review`** (before ODPC commits), and never on the other tier-1 level's categories. ODPC may override **any non-`finished`** Answer (`in_review`, `recommended`, or `rejected`) on **any** category within its batch. **A `finished` Answer is immutable to everyone — ODPC included.** Pre-commit, ODPC rules all; once `finished`, the Answer is locked forever. The Factory can act only on `rejected` Answers (accept a change-score, object, or redo) and never on `recommended` or `finished` ones.

### Evaluator Verdict
An Evaluator commits a **single batch** — one payload over the Answers it is allowed to act on. Each entry is one of **three outcomes**, but the resulting status depends on the caller's level:
- **approve** → tier-1 writes `recommended`; **ODPC writes `finished`** (no `description` required).
- **change-score** → Answer `rejected` with a [[Verdict Score]] (`verdict_choice` `0–3`) + **mandatory** `description`. Files preserved.
- **reject** → Answer `rejected`, `verdict_choice` null, + **mandatory** `description`. Files deleted from MinIO (at ODPC commit).

The server writes all `answerLogs` rows **atomically in one transaction**; no partial/per-answer save. File I/O (deletes for hard-rejects) runs **outside** the txn, before it, per the project's file-I/O pattern. The acting evaluator is recorded via `answerLogs.eval_id` and `coverLogs.evaluatorId`.

- **Tier-1 (Mental/DOH) batches are non-finalizing** — approvals become `recommended` (overridable), change-scores/rejects become `rejected` recommendations; the Cover stays `in_review`. No files are deleted yet (deferred to ODPC commit).
- **ODPC's batch finalizes.** ODPC has a **single action — `commit` — and it is always the finalizing action** (no ODPC draft / partial-save state; ODPC must resolve the whole Cover in one commit). ODPC may rewrite any **non-`finished`** Answer (override a `recommended`, re-score, flip a reject) and must resolve every Answer still `in_review` (backstop). At commit, ODPC **converts every `recommended` Answer it did not override into `finished`**. Finalization is valid only when, after the batch, **no Answer remains `in_review` or `recommended`** — every Answer is terminal (`finished` or `rejected`); a commit that leaves anything unresolved is **rejected as invalid** (not a third outcome). MinIO files for all hard-rejected Answers are deleted, then the single transition is computed across the **whole** Cover from the aggregate answer states:
  - All Answers `finished` → Cover `finished` (compute [[Grade]]; email Factory: "complete + grade").
  - Any Answer `rejected` → Cover `in_progress` (consolidated send-back; no Grade; email Factory: "revision needed").

**Either way, every ODPC batch commit emails the Factory** (via `enrolls.email`) — `finished` carries the result + Grade, `in_progress` notifies that results came back for revision. Tier-1 (non-finalizing) submissions and Factory re-submissions never email.

Because **only ODPC writes the `coverLogs` transition** and the Factory never holds the Cover while an Evaluator is active, there is no factory↔evaluator race and no cover-status race. Note ODPC cannot *force* a final score value — a contested change-score resolves only through the [[Negotiation Loop]]; ODPC controls the Cover *transition*, not the score's value.

### Re-evaluation Loop
The cycle when ODPC finalizes with ≥1 `rejected` Answer:
1. ODPC's finalize leaves ≥1 Answer `rejected` → **Cover → `in_progress`**, returning the consolidated send-backs to the Factory. (Every Answer is now `finished` or `rejected` — none `in_review`.)
2. Factory addresses each `rejected` Answer:
   - **change-score** (`verdict_choice` set) → **accept** (Answer → `recommended`, Verdict Score is the live choice, finalized by ODPC) or **object** (free re-answer → `in_review`); see [[Negotiation Loop]].
   - **hard reject** (`verdict_choice` null) → **redo** the Answer (re-upload evidence; → `in_review`).
   **`recommended` and `finished` Answers are locked** — the Factory cannot touch them.
3. Factory re-submits → Cover returns to `in_review`. Allowed when **no Answer is still `rejected`** (every send-back accepted→`recommended` or objected/redone→`in_review`).
4. The owning tier-1 level re-judges its re-submitted Answers (or ODPC backstops); **`recommended` Answers carry over** and are not re-reviewed by tier-1 (ODPC converts them to `finished` at commit unless it overrides). ODPC finalizes again.
5. Iterate until ODPC commits with every Answer `finished` → Cover `finished`. The loop is **unbounded** — it ends only by agreement, never by force.

## Evaluation Flow (diagram)

```
                        ┌───────────────────────────┐
                        │          FACTORY          │
                        │   Cover: in_progress      │
                        │   (fills in Answers)      │
                        └─────────────┬─────────────┘
                                      │ submit
                                      │ (all Answers → in_review;
                                      │  allowed when no Answer is rejected)
                                      ▼
                        ┌───────────────────────────┐
              ┌────────▶│       Cover: in_review    │
              │         └─────────────┬─────────────┘
              │                       │
              │                       ▼
              │         ┌───────────────────────────┐
              │         │   TIER-1 REVIEW           │   non-finalizing
              │         │   Mental / DOH (OWN cats) │   (Cover stays
              │         │   per Answer: approve     │    in_review;
              │         │   (→recommended) /         │    no files
              │         │   change-score / reject   │    deleted yet)
              │         └─────────────┬─────────────┘
              │                       │
              │                       ▼
              │         ┌───────────────────────────┐
              │         │   ODPC REVIEW  (FINALIZER)│   sole finalizer
              │         │   • Collaborate, Outcome  │
              │         │   • overrides any tier-1  │
              │         │     (non-finished only)   │
              │         │   • backstops in_review   │
              │         │   • deletes hard-reject   │
              │         │     files; computes Grade │
              │         └─────────────┬─────────────┘
              │                       │ finalize valid only when
              │                       │ NO Answer remains in_review
              │                       ▼
              │                ╱─────────────────╲
              │           yes ╱   any Answer       ╲ no
              │         ┌─────┤    rejected?         ├─────┐
              │         │      ╲                    ╱      │
              │         │       ╲──────────────────╱       │
              │         ▼                                  ▼
              │  ┌───────────────────────────┐   ┌───────────────────────────┐
              │  │   Cover: in_progress      │   │     Cover: finished       │
              │  │   (send-backs returned    │   │  (all Answers finished;   │
              │  │    to Factory; email       │   │   Grade computed + email; │
              │  │    "revision needed")     │   │   factory score endpoint  │
              │                │                 │   is the final report)    │
              │                │                 └───────────────────────────┘
              │                │ Per rejected Answer the Factory:
              │                │  • change-score → ACCEPT (→recommended; ODPC
              │                │      finalizes; same file validator)
              │                │                 → OBJECT (re-answer →in_review)
              │                │  • hard reject  → REDO (re-answer →in_review)
              │                │ recommended/finished Answers locked, not re-reviewed.
              │                │ Re-submit allowed when no Answer is rejected.
              └────────────────┘
                         re-submit  →  back to in_review (UNBOUNDED loop)
```

**Reading the loop:** Tier-1 (Mental/DOH) verdicts never move the Cover. Only ODPC writes the `coverLogs` transition, so there is no factory↔evaluator or cover-status race. Each pass only re-touches Answers the Factory re-submitted; `finished` Answers are immutable to **everyone** (the Factory and all Evaluators, ODPC included). ODPC controls the Cover *transition* but cannot *force* a contested score — that resolves only by agreement in the [[Negotiation Loop]], so the loop is unbounded.

## Resolved PO Decisions

- **Verdict outcome model** _(resolved)_: Three per-Answer outcomes — **approve**, **change-score** (→`rejected` + [[Verdict Score]] `0–3` + mandatory desc), **reject** (→`rejected`, null verdict + mandatory desc). Change-score and reject reuse `rejected`, told apart by `verdict_choice`.
- **When an Answer is `finished`** _(resolved 2026-06-17, Gap 1 → option a)_: **Only ODPC's commit writes `finished`.** A tier-1 approve and a Factory-accept both write the new **`recommended`** status — provisionally settled, still overridable by ODPC, converted to `finished` at ODPC's commit. This makes "tier-1 non-finalizing" literally true and keeps ODPC's override authority total (it never collides with an immutable `finished`). **Cost:** `answerStatus` enum grows to 4 values (`in_review`, `recommended`, `rejected`, `finished`).
- **Verdict Score storage** _(resolved)_: New nullable `verdict_choice` column on `answerLogs` (Choices enum, `0–3` only — no `n/a`). Factory's `answers.selectedChoice` is never overwritten. Live choice for Score/Grade = latest **accepted** choice.
- **Score dispute = unbounded [[Negotiation Loop]]** _(resolved)_: Factory accepts a change-score (→ `recommended`, ODPC finalizes) or objects (free re-answer → `in_review`). Repeats without bound; ends only by agreement. ODPC cannot force a score value. **Accept re-uses the normal file validator** (Gap C) — an upward Verdict Score the existing files don't support requires the missing files, else the Factory must object instead.
- **Evaluator authority** _(resolved)_: Tier-1 edit own verdicts only while Cover `in_review`; ODPC has full override of any non-`finished` Answer (`in_review`/`recommended`/`rejected`) on any category within its batch. **`finished` is immutable to everyone, ODPC included.**
- **Grade retrieval** _(resolved 2026-06-17, Gap 2 → option a)_: `grade` is added to the [[Score Report]] (and the Evaluator/Provincial/Admin list endpoints), populated for `finished` Covers and `null` otherwise — recomputed on-demand. This is the post-finalize retrieval path; the Grade is still never persisted.
- **ODPC assignment invariant** _(noted, Gap D)_: ODPC is the sole finalizer, so a region with no assigned ODPC evaluator could never finalize any Cover. Per PO this **does not happen** — every region always has an ODPC assigned (the `enrolls` evaluator-assignment slots guarantee it). Treated as an invariant, not a runtime guard.
- **Email notifications** _(resolved 2026-06-17)_: One email to the Factory on **every ODPC batch commit** (via `enrolls.email`) — both finalize-to-`finished` ("complete + Grade") and bounce-to-`in_progress` ("revision needed"). **No** email for tier-1 (non-finalizing) submissions or Factory re-submissions. New BullMQ job type(s) (see ADR-0002 for email-worker scope).
- **`level → category` ownership map** _(resolved)_: **DOH** → `Disease`, `Safety`. **Mental** → `Mental`. **ODPC** → `Collaborate`, `Outcome` (primary) + override over all 5.
- **Final verdict grading** _(resolved)_: Four tiers — `gold` / `silver` / `certificate` / `joined` — computed **only on the transition to `finished`**, from each Answer's live (verdict-adjusted) choice, and returned in the finalize response. Evaluated **strictly top-down with overall floors** (`gold` ≥90, `silver` ≥80, `certificate` ≥60, `joined` <60), not closed bands — bands left ungraded holes for demoted high-overall Covers (resolved 2026-06-17). See [[Grade]] for the full gates.
- **File handling on send-back** _(resolved)_: **change-score preserves** files (the Factory needs them to object); **hard reject deletes** them from MinIO, executed at **ODPC's batch commit** (outside the txn, per the file-I/O pattern), not at each evaluator's click. On objection/redo the Factory freely manages files (add / replace / delete when lowering score), validated against the new choice's file requirements.

## Review Endpoints

Evaluator-facing, under `evalGuard`. The verdict endpoint is **level-aware** — the service reads the caller's `level` (via `evaluatorService.helper.getEvaluatorData`) and applies the tier-1 vs ODPC rules. **Category → level ownership** (the access map both endpoints enforce server-side): `Mental → {Mental}`, `DOH → {Disease, Safety}`, `ODPC → all 5`.

| Endpoint | Caller | Behaviour |
|----------|--------|-----------|
| `GET /twhp/api/evaluators/covers/:coverId/answers` | Any Evaluator (region-scoped) | Each Answer with current status, question + category, the factory's `selectedChoice`, and any existing `verdict_choice` + `description`. Results are a **hard server-side filter** by the caller's owned categories (not a UI hint): Mental sees only `Mental`, DOH only `Disease`/`Safety`, ODPC all 5. |
| `POST /twhp/api/evaluators/covers/:coverId/verdict` | Any Evaluator | Batch of `{ answerId, decision: approve\|change_score\|reject, verdictChoice?, description? }` over the Answers the caller may act on. **Out-of-scope guard (fail-loud):** if any entry targets an Answer outside the caller's owned categories, the **whole batch is rejected with `403`** — no partial application. `change_score` requires `verdictChoice` (`0–3`) + `description`; `reject` requires `description`; `approve` needs neither. **Tier-1** → approve writes `recommended`, change/reject write `rejected`; Cover stays `in_review` (non-finalizing). **ODPC** → may override any non-`finished` Answer; **finalizes**: converts un-overridden `recommended` Answers to `finished`, valid only when no Answer is left `in_review`/`recommended`; deletes MinIO files of hard-rejected Answers; then all `finished` → Cover `finished` (response includes **Grade**), any `rejected` → Cover `in_progress`. **Either outcome queues a factory email** ("complete + Grade" or "revision needed"). One transaction (file deletes run before it). |
| _(factory side)_ `accept` / `object` / `redo` on a `rejected` Answer | Factory (own Cover) | Handled via the existing factory answer endpoints: **accept** a change-score → Answer `recommended` (Verdict Score becomes live; ODPC finalizes), re-using the normal per-choice file validator; **object**/**redo** → re-answer with managed evidence → `in_review`. Re-submit the Cover when no Answer is `rejected`. |

**v1 scope:** "sent to evaluators / factory" means the Cover surfaces in the other party's list endpoint. **Email notification** is sent to the Factory (via `enrolls.email`) on **every ODPC batch commit** — both finalize-to-`finished` and bounce-to-`in_progress` — but **not** for tier-1 submissions or Factory re-submissions (see ADR-0002). Both `change_score` and `reject` require a `description`; `approve` does not. After ODPC finalizes to `finished`, the **existing** factory score endpoint (`GET /twhp/api/factories/assessments/score`) is the final-score report — but it now reflects **live (verdict-adjusted) choices**, and the finalize response additionally carries the [[Grade]] (ADR-0001 still holds: no *new* score endpoint).

## Score Endpoints

Every Score Report carries `grade` (populated for `finished` Covers, `null` otherwise) — this is the on-demand retrieval path for a Grade after finalize.

| Role | Path | Scope |
|------|------|-------|
| Factory | `GET /twhp/api/factories/assessments/score` | Own Cover |
| Evaluator | `GET /twhp/api/evaluators/score` | All Covers in evaluator's region |
| Provincial Officer | `GET /twhp/api/provincialOfficers/score` | All Covers in officer's province |
| Admin (DOED) | `GET /twhp/api/admins/score` | All Covers (optional `?region=` / `?provinceId=` filters) |
