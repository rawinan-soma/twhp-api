---
id: 004-odpc-finalize-action
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
status: draft
priority: must
created: 2026-07-02T00:00:00Z
assigned_bolt: 020-per-answer-verdict-save
implemented: false
---

# Story: 004-odpc-finalize-action

# User Story

**As** ODPC
**I want** a separate finalize action that resolves the whole Cover from persisted verdicts
**So that** the Cover transition stays atomic and I remain the sole finalizer

## Acceptance Criteria

- [ ] **Given** `finalize(coverId, reviewer)`, **When** the caller is not ODPC/admin (a tier-1), **Then** `403`
- [ ] **Given** finalize, **When** it runs, **Then** it reads the **persisted** latest `answerLogs` (no in-flight batch / no `effectiveState` merge)
- [ ] **Given** any Answer still `in_review` after reading, **When** finalizing, **Then** `400` ("unresolved in_review answers remain") — finalize invents no verdict
- [ ] **Given** un-overridden `recommended` Answers, **When** finalizing, **Then** each is converted to `finished` (covers tier-1 approvals, Factory-accepts, and ODPC's own approvals)
- [ ] **Given** hard-rejected Answers (`verdict_choice` null), **When** finalizing, **Then** their MinIO files are deleted **outside** the txn, **before** it
- [ ] **Given** all Answers resolve to `finished`, **When** committed, **Then** a single `coverLogs` row `finished` is written with `evaluatorId`, and the response includes the computed **Grade**
- [ ] **Given** ≥1 Answer `rejected`, **When** committed, **Then** a single `coverLogs` row `in_progress` is written (no Grade)
- [ ] **Given** either outcome, **When** committed, **Then** exactly one factory email is enqueued (via `enrolls.email`): "complete + Grade" or "revision needed"
- [ ] **Given** finalize is the only writer, **When** the codebase is inspected, **Then** **no** save path writes `answerStatus = finished` (FR-5)
- [ ] **Given** the finalize transaction, **When** it runs, **Then** the `recommended → finished` conversions + the `coverLogs` transition are committed together (file deletes already done before it)

## Technical Notes

- This is the refactor of `evaluator-review.ts:249–431` — but the old batch-merge (`batchDecisionMap`/`effectiveState`) is removed: the source of truth is entirely the persisted logs.
- Backstop = the `recommended → finished` conversion; there is no auto-verdict for `in_review` (hard-gate instead).
- Grade computed on-demand via `calculateBreakdown`/`computeGrade`; never persisted (ADR-0001).
- File I/O strictly before the DB transaction (project pattern).

## Dependencies

### Requires
- 002-save-answer-verdict-service

### Enables
- 005-save-and-finalize-routes
- 006-admin-surface-parity

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Finalize with an untouched `in_review` Answer | `400` — ODPC must save a verdict on it first |
| Answer hard-rejected then later approved before finalize | Files retained; converts per its latest log |
| A `recommended` ODPC never overrode | Converted to `finished` at finalize |
| MinIO delete fails | Surfaces before txn; no partial cover transition |

## Out of Scope

- Route wiring (005); admin surface (006). Grade/email **content** unchanged from `003`.
