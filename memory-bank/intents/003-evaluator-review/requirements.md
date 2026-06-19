---
intent: 003-evaluator-review
phase: inception
status: complete
created: 2026-06-16T00:00:00Z
updated: 2026-06-17T00:00:00Z
---

# Requirements: Evaluator Review (Hierarchical ODPC-Gated Cover Review)

## Intent Overview

A hierarchical, level-aware review flow for factory assessment Covers. After a Factory submits its self-report (Cover `in_progress → in_review`), Evaluators render per-Answer verdicts scoped by `level`. Review is **hierarchical, not peer**: tier-1 reviewers (Mental, DOH) judge only their own QuestionCategories and are **non-finalizing**; **ODPC** is the **sole finalizer** — owns the remaining categories, may override any non-`finished` tier-1 verdict, backstops unjudged Answers, and is the only role that transitions the Cover and returns results to the Factory.

Beyond approve/reject, an Evaluator may **change-score** an Answer (propose a corrected score), which the Factory can **accept** or **object** to — an unbounded negotiation. On each ODPC commit the Cover either finalizes to `finished` (awarding a Grade) or bounces to `in_progress` for revision; either way the Factory is emailed.

Authoritative design: `CONTEXT.md` (Evaluator, Evaluator Verdict, Verdict Score, Negotiation Loop, Re-evaluation Loop, Grade, Review Endpoints), **ADR-0003** (hierarchical ODPC-gated review), **ADR-0004** (verdict-score consensus loop), **ADR-0001** (score on-demand), **ADR-0002** (email-worker scope).

## Business Goals

| Goal | Success Metric | Priority |
|------|---------------|----------|
| Evaluators review a submitted Cover within their level's categories | Mental sees/acts only on `Mental`; DOH on `Disease`/`Safety`; ODPC on all 5 | Must |
| ODPC is the single finalizer with override authority | Only ODPC's batch writes the `coverLogs` transition | Must |
| Evaluators can correct scores, factories can contest | change-score → accept/object negotiation reaches agreement | Must |
| Resolve a finished Cover to an award tier | `finished` Cover returns `gold`/`silver`/`certificate`/`joined` | Must |
| Notify the Factory whenever ODPC sends results back | Email on every ODPC commit (finished + in_progress) | Must |
| Re-evaluation never re-reviews settled work | `finished` Answers are sticky, immutable to all | Must |

---

## Functional Requirements

### FR-1: Level-aware Answer list (read)
- **Description**: `GET /twhp/api/evaluators/covers/:coverId/answers` returns each Answer with status, question + category, the factory's `selectedChoice`, and any existing `verdict_choice` + `description`.
- **Acceptance Criteria**:
  - Results are a **hard server-side filter** by the caller's owned categories (map: `Mental → {Mental}`, `DOH → {Disease, Safety}`, `ODPC → all 5`) — not a UI hint.
  - Region-scoped via `evaluatorService.helper.getEvaluatorData` (caller only sees Covers in their `region`).
- **Priority**: Must

### FR-2: Level-aware batch verdict (write)
- **Description**: `POST /twhp/api/evaluators/covers/:coverId/verdict` accepts a batch of `{ answerId, decision: approve|change_score|reject, verdictChoice?, description? }` over `in_review` Answers the caller may act on, applied **atomically in one transaction** (no partial/per-answer save).
- **Acceptance Criteria**:
  - **Out-of-scope guard (fail-loud):** if any entry targets an Answer outside the caller's owned categories, the **whole batch is rejected with `403`** — no partial application.
  - `change_score` requires `verdictChoice` (`0–3`) + `description`; `reject` requires `description`; `approve` requires neither (validated → `400` on violation).
  - Acting evaluator recorded via `answerLogs.eval_id` (and `coverLogs.evaluatorId` on ODPC commit).
- **Priority**: Must

### FR-3: Three verdict outcomes (level-dependent status)
- **Description**: Each verdict entry maps to one of three outcomes; the status for `approve` depends on the caller's level.
- **Acceptance Criteria**:
  - **approve** → tier-1 writes **`recommended`**; **ODPC** writes **`finished`** (no `description` required).
  - **change-score** → `rejected` + `verdict_choice` (`0–3`) + mandatory `description`; files **preserved**.
  - **reject** → `rejected`, `verdict_choice` null, + mandatory `description`; files **deleted** (at ODPC commit).
  - change-score and reject share `rejected`, distinguished by `verdict_choice` presence.
  - **`answerStatus` enum gains a 4th value `recommended`** (provisionally settled, ODPC-overridable). Only ODPC's commit writes `finished`.
- **Priority**: Must

### FR-4: Verdict Score (schema + semantics)
- **Description**: Add nullable `answerLogs.verdict_choice` (Choices enum, restricted to `0–3`, never `n/a`) capturing an Evaluator's proposed correction; the factory's `answers.selectedChoice` is never overwritten.
- **Acceptance Criteria**:
  - The **live choice** used by Score/Grade = the most recently **accepted** choice (factory's `selectedChoice` by default; an accepted Verdict Score replaces it).
  - An open (unaccepted) verdict does not change the computed Score.
  - Evaluators may pull an `n/a` into scoring (`0–3`) but cannot push a scored Answer out to `n/a`.
- **Priority**: Must

### FR-5: Tier-1 non-finalizing; ODPC finalizes & overrides
- **Description**: Tier-1 (Mental/DOH) batches record outcomes on their own categories and leave the Cover `in_review`. ODPC's batch finalizes.
- **Acceptance Criteria**:
  - Tier-1 approve → `recommended`; tier-1 may edit **their own** verdicts only while the Cover is `in_review`; never the other tier-1 level's categories.
  - ODPC may override any **non-`finished`** Answer (`in_review`/`recommended`/`rejected`) on any category, and backstops Answers left `in_review`.
  - **Only ODPC's commit writes `finished`**; at commit ODPC converts every un-overridden `recommended` Answer to `finished`. A `finished` Answer is **immutable to everyone, ODPC included**.
  - **Single-shot**: ODPC has one action (`commit`), always finalizing — no ODPC draft/partial-save. ODPC must resolve the whole Cover in one commit.
  - ODPC finalize is valid only when, after its batch, **no Answer remains `in_review` or `recommended`** (all terminal); a commit leaving anything unresolved is **rejected as invalid** (not a third outcome). Then the single transition is computed from aggregate states: all `finished` → Cover `finished`, any `rejected` → Cover `in_progress`. Only ODPC writes the `coverLogs` transition.
- **Priority**: Must

### FR-6: Negotiation (consensus) loop
- **Description**: A change-score sends the Answer back (in ODPC's committed batch); the Factory accepts or objects.
- **Acceptance Criteria**:
  - **Accept** → Answer `recommended` (Verdict Score becomes live; ODPC finalizes); re-uses the **same per-choice file validator** — an upward Verdict Score the existing files don't support requires the missing files, else the Factory must object.
  - **Object** → free re-answer (new `selectedChoice`, possibly equal) → `in_review`; owning level re-judges (ODPC backstops/finalizes).
  - Repeats **without bound**; no "new evidence required" guard; terminates only by agreement. A Cover cannot finish while any Answer is mid-dispute.
- **Priority**: Must

### FR-7: File handling on send-back & re-answer
- **Description**: File lifecycle is coupled to outcome and runs **outside** the DB transaction (per the project file-I/O pattern).
- **Acceptance Criteria**:
  - **change-score preserves** files; **hard reject deletes** them from MinIO, executed at **ODPC's batch commit** (collect all hard-rejected Answers, delete, then run the txn) — not at each evaluator's click.
  - On object/redo the Factory freely manages evidence (append / replace / delete when lowering score), reconciling MinIO before the txn, validated against the new choice's per-choice file requirements.
- **Priority**: Must

### FR-8: Re-submission gate (factory)
- **Description**: Factory re-submits the Cover after addressing send-backs.
- **Acceptance Criteria**:
  - Re-submission allowed only when **no Answer is still `rejected`** (every send-back accepted→`finished` or objected/redone→`in_review`).
  - On re-submit, Cover returns to `in_review`. `finished` Answers carry over (sticky) and are not re-reviewed.
- **Priority**: Must

### FR-9: Grade on finalize
- **Description**: On the transition to `finished`, compute a Grade from each Answer's live choice and return it in the finalize response.
- **Acceptance Criteria** (evaluated **strictly top-down**, overall **floors** not bands):
  - `gold` — every category **> 80%** · overall **≥ 90%** · full score (`"3"`) on every `special` `1`/`3` question.
  - `silver` — every category **> 60%** · overall **≥ 80%**.
  - `certificate` — overall **≥ 60%**.
  - `joined` — overall **< 60%**.
  - No Grade when ODPC's finalize leaves the Cover `in_progress`.
  - **Retrieval**: `grade` is added to the **Score Report** (and Evaluator/Provincial/Admin list endpoints), populated for `finished` Covers and `null` otherwise — recomputed on-demand (ADR-0001: still no *new* score endpoint).
- **Priority**: Must

### FR-10: Factory email on every ODPC commit
- **Description**: A factory email (via `enrolls.email`) is queued on every ODPC batch commit.
- **Acceptance Criteria**:
  - finalize-to-`finished` → "complete + Grade"; bounce-to-`in_progress` → "revision needed".
  - **No** email for tier-1 (non-finalizing) submissions or Factory re-submissions.
  - Delivered via the existing BullMQ `email` queue with new job type(s) / two templates (see ADR-0002 for worker scope).
- **Priority**: Must

---

## Non-Functional Requirements

### Integrity & Concurrency
| Requirement | Target |
|-------------|--------|
| Atomic verdict batch | All `answerLogs` rows + any `coverLogs` transition in **one** DB transaction; no partial save |
| File I/O ordering | MinIO deletes/uploads run **before** the txn (never inside it) |
| Race freedom | Single-finalizer (only ODPC writes the transition) + Factory never holds the Cover while an Evaluator acts → no factory↔evaluator or cover-status race; no locking apparatus |

### Auditability
- Every verdict records `answerLogs.eval_id`; every ODPC transition records `coverLogs.evaluatorId`. Status is event-sourced (latest log row = current state).

### Scope & Consistency
- Region scoping for Evaluators; fiscal-year scoping for Cover/enrollment queries (`utilities().getFiscalYear()`).
- Reuses existing factory score endpoint as the final-score report; the score now reflects **live (verdict-adjusted) choices**.

---

## Constraints

### Technical Constraints
**Project-wide standards** loaded by Construction Agent.

**Intent-specific:**
- **Schema changes** (via `schema.ts` + `db:push`, await human review — no direct migration edits):
  - add nullable `answerLogs.verdict_choice` (Choices enum, `0–3` only).
  - **add `recommended` to the `answerStatus` enum** (4 values: `in_review`, `recommended`, `rejected`, `finished`). Audit existing `answerStatus` switches (score guard, cover-transition, answer derivations) for the new value.
  - add `grade` to the Score Report response schema (computed, not a column).
- Endpoints under `evalGuard`; verdict endpoint is level-aware via `getEvaluatorData`.
- Category → level ownership map is a server-side constant sourced from CONTEXT.md.

### Business Constraints
- ODPC availability gates throughput (single finalizer).
- A Cover may **never settle** if Factory and Evaluator never agree (accepted trade-off; no forced resolution in v1 — future ADR if escalation/deadline is needed).

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| No Cover/category is entirely `n/a` (no score division-by-zero) | Grade/category gate hits `0/0` | Confirmed by PO (does not happen); revisit if data shows otherwise |
| **Every region always has an ODPC evaluator assigned** | A Cover could never finalize (ODPC is sole finalizer) | Confirmed by PO (does not happen); guaranteed by the `enrolls` evaluator-assignment slots — invariant, not a runtime guard |
| One ODPC evaluator per Cover region acts on a batch | Concurrent ODPC commits | Single-finalizer model; out of scope to lock |

---

## Open Questions

_None outstanding._ All prior PO questions resolved (see CONTEXT.md "Resolved PO Decisions" and ADR-0003/0004). Future-ADR candidate only: escape hatch for a never-settling negotiation loop (escalation / admin override / deadline) — explicitly **not** in v1.
