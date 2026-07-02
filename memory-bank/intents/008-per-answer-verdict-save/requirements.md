---
intent: 008-per-answer-verdict-save
phase: inception
status: complete
created: 2026-07-02T00:00:00.000Z
updated: 2026-07-02T00:00:00.000Z
---

# Requirements: Per-Answer Verdict Save + Separate ODPC Finalize

## Intent Overview

Replace the single-batch evaluator verdict (intent `003-evaluator-review`) with a **two-phase** model: reviewers record verdicts **one Answer at a time** (durable, resumable per-Answer saves), and a **separate, atomic, ODPC-only finalize** performs the whole-Cover transition. The change is about **write granularity and where the Cover transition lives** — it does **not** alter any ADR-0003/0004 domain rule (hierarchical review, ODPC as sole finalizer, the four-value `answerStatus`, Verdict Score, the unbounded Negotiation Loop, grading, or the finalize email).

The batch model fails the reviewer: a long review held client-side is lost on disconnect/session-expiry, and there is no server-side "review in progress" state to resume from. Per-Answer save persists each verdict the moment it is made.

This intent is a **brown-field enhancement** of `003-evaluator-review` and its bolts. Concurrency is explicitly **not** a driver — no new concurrent writers are introduced, so ADR-0003's single-finalizer race-freedom holds unchanged.

Authoritative design: **ADR-0005** (per-answer verdict save + separate finalize), `CONTEXT.md` (Evaluator Verdict, Answer Review, Evaluator, Review Endpoints, Evaluation Flow diagram), superseding the "single batch / no partial save" clause of **ADR-0003** and the "ODPC single `commit` action" framing of **ADR-0004**. No schema change (`answerLogs` is already append-only per Answer).

## Business Goals

| Goal | Success Metric | Priority |
|------|---------------|----------|
| In-progress review work survives disconnects | Every saved verdict is persisted immediately; a lost session loses no saved Answer | Must |
| Reviewers can stop and resume mid-Cover | A partially reviewed Cover is a valid state (some Answers still `in_review`); reviewer resumes from persisted state | Must |
| Preserve every ADR-0003/0004 invariant | Single finalizer, ODPC-only Cover transition, 4-value `answerStatus`, deferred file deletion, one email per finalize — end state identical to batch model | Must |
| Only finalize writes `finished` | No verdict-save path writes `finished`; even ODPC `approve` writes `recommended` | Must |
| Reviewers edit their own in-flight verdicts | Authorship-keyed guard permits re-save; protects Factory-accepted recommendations from tier-1 re-opening | Must |
| Both review surfaces behave identically | `evaluators/covers/*` and `admins/covers/*` (admin-as-national-ODPC) share save + finalize | Must |

---

## Functional Requirements

### FR-1: Per-Answer verdict save (write)
- **Description**: `POST /twhp/api/evaluators/covers/:coverId/answers/:answerId/verdict` accepts a **single** verdict entry `{ decision: approve|change_score|reject, verdictChoice?, description? }` for one Answer. `answerId` is a path parameter (moved out of the request body). Appends exactly one `answerLogs` row and returns the Answer's new status.
- **Acceptance Criteria**:
  - `change_score` requires `verdictChoice` (`0–3`) + `description`; `reject` requires `description`; `approve` requires neither (validated → `400` on violation).
  - A `change_score` whose `verdictChoice` equals the Answer's current live choice is rejected `400` (no-op; use `approve`).
  - **Out-of-scope guard (fail-loud):** an Answer outside the caller's owned categories → `403`.
  - The Answer must belong to the Cover and the Cover must be region-accessible to the caller → `404`/`403` otherwise.
  - The save has **no side effects beyond the log insert**: no MinIO I/O, no `coverLogs` write, no email.
  - Acting evaluator recorded via `answerLogs.eval_id`.
- **Priority**: Must
- **Related Stories**: TBD

### FR-2: Save = verdict, level-dependent status (no draft)
- **Description**: A save immediately writes the resolved `answerStatus`; there is no intermediate draft state.
- **Acceptance Criteria**:
  - **approve** → **`recommended`** for **every** caller (tier-1 *and* ODPC/admin) — no `description`.
  - **change-score** → `rejected` + `verdict_choice` (`0–3`) + mandatory `description`; files **preserved**.
  - **reject** (hard) → `rejected`, `verdict_choice` null, + mandatory `description`; files **not** deleted at save time.
  - **No verdict-save path writes `finished`** (this is FR-5's invariant, enforced here at the write layer).
  - `answerStatus` enum is **unchanged** (still `in_review`, `recommended`, `rejected`, `finished`).
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Authorship-keyed edit guard
- **Description**: Re-saving an Answer is the edit mechanism; the write guard governs who may write over the current state.
- **Acceptance Criteria**:
  - `finished` → immutable to everyone (including ODPC) → reject `400`.
  - `recommended` → writable only by its **author** (matching `answerLogs.eval_id`) **or** ODPC → otherwise `403`. (Protects a Factory-accepted `recommended` — no tier-1 author — from tier-1 re-opening.)
  - `rejected` / `in_review` → writable by any category-scoped reviewer (tier-1 on its own categories, ODPC on any).
  - A tier-1 may re-edit its own verdicts only while the Cover is `in_review`.
  - Replaces the current blanket `recommended && level !== "ODPC" → 403` guard (which wrongly blocked a tier-1 editing its own `recommended`).
- **Priority**: Must
- **Related Stories**: TBD

### FR-4: ODPC finalize (separate whole-Cover action)
- **Description**: `POST /twhp/api/evaluators/covers/:coverId/finalize` — **empty body**, **ODPC/admin only** (tier-1 → `403`). Reads the already-persisted latest `answerLogs` (no in-flight batch) and performs the whole-Cover transition in one transaction.
- **Acceptance Criteria**:
  - **Hard-gate**: if any Answer is still `in_review`, finalize is rejected `400` ("unresolved in_review answers remain") — finalize never invents a verdict.
  - Converts every un-overridden `recommended` → `finished` (covers tier-1 approvals, Factory-accepts, **and** ODPC's own approvals).
  - Deletes MinIO files for all hard-rejected Answers (`verdict_choice` null), **outside** the txn, before it (file-I/O pattern).
  - Writes the single `coverLogs` transition: all `finished` → Cover `finished` (compute + return **Grade**); any `rejected` → Cover `in_progress` (no Grade).
  - Emails the Factory on **either** outcome (via `enrolls.email`): "complete + Grade" or "revision needed".
  - Records the actor via `coverLogs.evaluatorId`.
- **Priority**: Must
- **Related Stories**: TBD

### FR-5: `finished` written exclusively by finalize
- **Description**: The only code path that writes `answerStatus = finished` is FR-4's finalize (via `recommended → finished` conversion).
- **Acceptance Criteria**:
  - No save endpoint writes `finished` under any level.
  - An ODPC `approve` saved during the review phase yields `recommended` and is revocable (ODPC may re-save it) until finalize.
  - The `coverLogs` transition is written only by finalize (Factory create → `in_progress` and Factory submit → `in_review` remain unchanged and out of scope here).
- **Priority**: Must
- **Related Stories**: TBD

### FR-6: File deletion deferred to finalize
- **Description**: Hard-reject evidence files are deleted only at finalize, only for Answers whose **final** persisted status is hard-reject.
- **Acceptance Criteria**:
  - A per-Answer hard-reject save performs **zero** MinIO operations.
  - A hard-reject later overridden (to approve/change-score) before finalize retains its files.
  - Deletion set is computed from the final `answerLogs` snapshot at finalize.
- **Priority**: Must
- **Related Stories**: TBD

### FR-7: Both review surfaces (evaluators + admin-as-ODPC)
- **Description**: The save + finalize split is available under both `evaluators/covers/*` and `admins/covers/*` (DOED admin reviewing as national ODPC, `region: null`).
- **Acceptance Criteria**:
  - Admin surface resolves the reviewer via `adminReviewerContext` (level `ODPC`, region null → existence-only Cover access).
  - Evaluator surface resolves via `resolveEvaluator` (level + region gate) unchanged.
  - Identical save semantics; finalize is ODPC/admin only on both.
- **Priority**: Must
- **Related Stories**: TBD

### FR-8: Remove the batch verdict endpoint + schema
- **Description**: The batch verdict path is retired in favor of per-Answer save.
- **Acceptance Criteria**:
  - `POST …/covers/:coverId/verdict` (batch) is removed on both surfaces.
  - `VerdictBatchSchema` and the "duplicate answerId in batch" `400` are removed; `VerdictEntrySchema` is reused as the single-save body; a `FinalizeSchema` (empty/`{}`) is added.
  - Existing behavior otherwise preserved (validation messages, status codes for the single-entry cases).
- **Priority**: Must
- **Related Stories**: TBD

### FR-9: Answer list unaffected
- **Description**: `GET …/covers/:coverId/answers` (the level-filtered read) is unchanged and remains the source for resuming a review.
- **Acceptance Criteria**:
  - Returns each Answer's current status (latest log), so a resuming reviewer sees which Answers are still `in_review`.
  - No change to filtering, projection, or region/category scope.
- **Priority**: Must
- **Related Stories**: TBD

---

## Non-Functional Requirements

### Durability & Resumability
| Requirement | Metric | Target |
|-------------|--------|--------|
| Verdict persistence | A saved verdict survives client disconnect | 100% — persisted in its own transaction at save time |
| Partial-review safety | A Cover with some Answers unreviewed is a valid, non-corrupt state | Always; finalize hard-gate prevents committing an unresolved Cover |

### Integrity & Concurrency
| Requirement | Metric | Target |
|-------------|--------|--------|
| Single finalizer | Only finalize writes the `coverLogs` transition | Invariant preserved from ADR-0003 |
| No factory↔evaluator race | Factory never holds the Cover while an Evaluator is active | Unchanged — no new concurrent writers |
| Finalize atomicity | `recommended→finished` conversion + transition committed together | One DB transaction; file deletes run before it |

### Auditability
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Verdict provenance | Every terminal verdict was explicitly authored | `answerLogs.eval_id` per save; finalize never fabricates verdicts |
| Event-sourced state | Current Answer/Cover state = latest log row | Append-only `answerLogs`/`coverLogs` unchanged |

---

## Constraints

### Technical Constraints

**Project-wide standards**: loaded by Construction Agent from `memory-bank/standards/`.

**Intent-specific constraints**:
- **No schema migration.** `answerStatus` enum and `answerLogs`/`coverLogs` tables are unchanged; this is purely API-granularity + transaction-placement.
- File I/O stays **outside** DB transactions (project file-I/O pattern) — only at finalize.
- Services return `status(code, body)` (no throwing); routes return them directly.
- Both surfaces reuse the existing `evaluator-review` service; no duplicated business logic.

### Business Constraints
- Behavior end-state per Cover must be identical to the batch model (no change to grades, emails, or negotiation outcomes).
- Frontend contract changes (path-param `answerId`, two-phase save→finalize) are **breaking** and coordinated with the in-flight `admins/covers` migration.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| `answerLogs` latest-row-wins already models per-Answer state | Would need schema work | Verified against `003` schema; append-only design confirmed |
| Every region always has an assigned ODPC (ADR-0004 Gap D) | A Cover could never finalize | Treated as an invariant, not a runtime guard — unchanged |
| Frontend can adopt the two-phase flow | Breaking API with no consumer | Coordinated with the `admins/covers` migration already in the working tree |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Admin force-status/override endpoint for stuck negotiation loops | PO | — | **Out of scope** for this intent (ADR-0004 defers escalation/override to a future ADR) |
| "Un-verdict" (revert a saved Answer to `in_review`) | PO | — | **Out of scope** — a reviewer changes their mind by re-saving a different decision (FR-3 permits it) |
