---
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
phase: inception
status: complete
created: 2026-07-02T00:00:00.000Z
updated: 2026-07-02T00:00:00.000Z
---

# Unit Brief: Per-Answer Verdict Save + Separate ODPC Finalize

## Purpose

Refactor the evaluator write path (`003-evaluator-review`) from a single atomic batch into two phases per ADR-0005: (1) a **per-Answer save** that appends one `answerLogs` row with no side effects — durable and resumable, with an authorship-keyed edit guard, and where **every** approve (tier-1 and ODPC) writes `recommended`; and (2) a **separate ODPC-only finalize** that reads the persisted logs, hard-gates on any `in_review`, converts `recommended → finished`, deletes hard-rejected files (outside the txn), writes the single `coverLogs` transition, computes the Grade, and emails the factory. The batch endpoint and `VerdictBatchSchema` are removed; the split is mirrored on the `admins/covers/*` surface. **No schema migration.**

## Scope

### In Scope

- **Schema/DTO** (`src/schema/evaluator-review.ts`): reuse `VerdictEntrySchema` as the single-save body; **drop `VerdictBatchSchema`** and the "duplicate answerId" `400`; add a `FinalizeSchema` (empty/`{}`).
- **`saveAnswerVerdict(coverId, answerId, reviewer, entry)`** (service): cover access + single-answer existence/scope check; no-op `change_score` guard (must differ from live choice); append one `answerLogs` row with `eval_id`; approve → `recommended` for **all** levels; change_score/reject → `rejected`. **No** MinIO I/O, `coverLogs` write, or email.
- **Authorship-keyed edit guard**: `finished`→nobody (`400`); `recommended`→author (`eval_id`) or ODPC (else `403`); `rejected`/`in_review`→any category-scoped reviewer. Replaces the blanket `recommended && level !== "ODPC" → 403`.
- **`finalize(coverId, reviewer)`** (service, ODPC/admin only): read latest `answerLogs`; hard-gate on any `in_review` (`400`); convert un-overridden `recommended → finished`; compute hard-reject delete set; delete MinIO files **before** the txn; write single `coverLogs` transition (all `finished`→`finished` + Grade; any `rejected`→`in_progress`); enqueue factory email. Only writer of `finished`.
- **Routes** (both surfaces): new `POST …/covers/:coverId/answers/:answerId/verdict` and `POST …/covers/:coverId/finalize` under `evaluators/covers/*` and `admins/covers/*`; **remove** the batch `verdict` routes; finalize guarded to ODPC/admin.
- **Docs + regression**: regen `docs/api/*` (openapi/API.md/index.html); restructure `evaluator-review.integration.test.ts` + `.verdict.integration.test.ts` to per-Answer save + separate finalize; confirm `GET …/answers` unchanged.

### Out of Scope

- Any schema migration (`answerStatus`/tables unchanged).
- Admin force-status/override endpoint (ADR-0004 — future ADR).
- "Un-verdict" revert to `in_review` (re-save a different decision covers it).
- Changes to the negotiation loop, grading formula, email content/templates, or factory endpoints.
- Concurrency-locking apparatus (single-finalizer preserved).

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Per-Answer verdict save (write) | Must |
| FR-2 | Save = verdict, level-dependent status (no draft) | Must |
| FR-3 | Authorship-keyed edit guard | Must |
| FR-4 | ODPC finalize (separate whole-Cover action) | Must |
| FR-5 | `finished` written exclusively by finalize | Must |
| FR-6 | File deletion deferred to finalize | Must |
| FR-7 | Both review surfaces (evaluators + admin-as-ODPC) | Must |
| FR-8 | Remove batch verdict endpoint + schema | Must |
| FR-9 | Answer list unaffected | Must |

## Interface (how other code interacts)

- Split the existing `evaluatorReviewService.verdict()` into `saveAnswerVerdict()` + `finalize()` on the same `createEvaluatorReviewService(db)` factory. Routes autoloaded under `evalGuard` (evaluators) and the admin guard (`admins/covers/*`).
- Reuses `resolveEvaluator` (level+region) and `adminReviewerContext` (ODPC, region null), `utilities().deleteFile`, the `email` queue, and `calculateBreakdown`/`computeGrade` (scoreHelpers) — all unchanged.
- `getAnswers()` is unchanged and remains the resume source.

## Dependencies

- Existing model: `answers`, `answerLogs`, `coverLogs`, `covers`, `enrolls`, `factories`, `provinces`, `questions`.
- Existing code refactored, not replaced: `src/service/evaluator-review.ts`, `src/schema/evaluator-review.ts`, `src/routes/{evaluators,admins}/covers/[coverId]/…`.
- Design authority: ADR-0005; `CONTEXT.md` (Evaluator Verdict, Answer Review, Review Endpoints, Evaluation Flow diagram).

## Key Risks

- **Finalize correctness**: dropping the in-flight-batch `effectiveState` merge — finalize must derive the whole-Cover transition purely from persisted logs. Backstop/gate/deletion-set must match the old batch end-state exactly.
- **File-delete timing**: any accidental delete on the per-Answer reject save would destroy evidence that ODPC could still override — deletion must stay strictly at finalize.
- **Guard regression**: the authorship key (`eval_id`) must not let a tier-1 re-open a Factory-accepted `recommended`, nor block a tier-1 editing its own.
- **Two surfaces**: behavior must be identical; finalize must be ODPC/admin only on both.

---

## Story Summary

- **Total Stories**: 7
- **Must Have**: 7
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-verdict-schema-refactor**: single-save body, drop batch schema, add FinalizeSchema - Must - Planned
- [ ] **002-save-answer-verdict-service**: `saveAnswerVerdict`, one log, approve→recommended, no side effects - Must - Planned
- [ ] **003-authorship-edit-guard**: eval_id-keyed write guard replacing blanket non-ODPC block - Must - Planned
- [ ] **004-odpc-finalize-action**: finalize service — gate, recommended→finished, deferred delete, transition, grade, email - Must - Planned
- [ ] **005-save-and-finalize-routes**: new save + finalize routes; remove batch route (evaluators) - Must - Planned
- [ ] **006-admin-surface-parity**: mirror save + finalize under admins/covers/* (admin-as-ODPC) - Must - Planned
- [ ] **007-answers-list-and-docs-regression**: GET answers unchanged; regen API docs; restructure integration tests - Must - Planned
