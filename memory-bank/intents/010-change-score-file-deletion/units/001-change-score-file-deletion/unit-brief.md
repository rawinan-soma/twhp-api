---
unit: 001-change-score-file-deletion
intent: 010-change-score-file-deletion
phase: inception
status: complete
created: 2026-07-07T00:00:00.000Z
updated: 2026-07-07T00:00:00.000Z
---

# Unit Brief: Change-Score File Deletion

## Purpose

Widen `evaluatorReviewService.finalize`'s file-deletion predicate so a `change_score` verdict deletes the factory's evidence file at finalize, exactly like a hard `reject` does today. Currently only `status === "rejected" && verdictChoice === null` triggers deletion; this unit drops the `verdictChoice === null` condition.

## Scope

### In Scope

- The `hardRejectIds` computation inside `finalize` (`src/service/evaluator-review.ts`).
- Renaming/re-commenting that variable and its surrounding comments so they no longer imply "hard reject only" (ADR-0006 consequence).
- Regression verification: cover-status/grade resolution, both review surfaces, and the existing integration test suite (`evaluator-review.*.integration.test.ts`).

### Out of Scope

- `saveAnswerVerdict` — stays zero-MinIO-I/O, no change.
- `hasRejected` / `coverStatus` / grade computation — unchanged.
- The answer-edit validator in `src/service/answer.ts` — already handles a missing file correctly; no change needed there.
- Any new route, schema, or DB migration.

---

## Assigned Requirements

| FR     | Requirement                                                        | Priority |
| ------ | ------------------------------------------------------------------- | -------- |
| FR-1   | Widen the finalize-time file-deletion predicate                     | Must     |
| FR-2   | Cover-status and grade computation unchanged                        | Must     |
| FR-3   | Both review surfaces (evaluator + admin-as-ODPC) stay in parity      | Must     |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|---|---|---|
| `answerLogs` (existing) | Append-only per-Answer verdict log | `status`, `verdictChoice`, `eval_id` — unchanged |
| `answers.fileUrl*` (existing) | 9 evidence-file columns (`fileUrl1_1..fileUrl3_3`) | Nulled + MinIO object deleted when the owning Answer resolves to `rejected` at finalize |

### Key Operations

| Operation | Description | Inputs | Outputs |
|---|---|---|---|
| `finalize` (existing, modified) | Whole-Cover ODPC finalize | `coverId`, `reviewer` | Widened deletion set; unchanged `coverStatus`/grade/email |

---

## Story Summary

| Metric        | Count |
| ------------- | ----- |
| Total Stories | 2     |
| Must Have     | 2     |
| Should Have   | 0     |
| Could Have    | 0     |

### Stories

| Story ID | Title | Priority | Status |
|---|---|---|---|
| 001-widen-finalize-file-deletion | Widen finalize's file-deletion predicate to include change_score | Must | Planned |
| 002-regression-coverstatus-and-surface-parity | Verify cover-status/grade and both surfaces are unaffected | Must | Planned |

---

## Dependencies

### Depends On

| Unit | Reason |
|---|---|
| `001-per-answer-verdict-save` (intent `008`) | Owns the `finalize` function this unit modifies; must be construction-complete (it is) |

### Depended By

| Unit | Reason |
|---|---|
| None | Terminal change for this domain area |

### External Dependencies

| System | Purpose | Risk |
|---|---|---|
| MinIO | Object storage the deletion call targets | Low — reuses existing `deleteFileStrict` call, just a wider input set |

---

## Technical Context

### Suggested Technology

Bun + ElysiaJS + Drizzle (existing stack, no new dependency).

### Integration Points

| Integration | Type | Protocol |
|---|---|---|
| MinIO | Object deletion | Existing `utilities().deleteFileStrict` |

### Data Storage

| Data | Type | Volume | Retention |
|---|---|---|---|
| `answers.fileUrl*` | Postgres columns (existing) | No change | Nulled on deletion, same as today's hard-reject path |

---

## Constraints

- Must preserve "file I/O outside and before the transaction" — a MinIO failure must still abort finalize with `500` before any DB write.
- Must not alter `saveAnswerVerdict`'s zero-MinIO-I/O guarantee.

---

## Success Criteria

### Functional

- [ ] A `change_score`-flagged Answer has its `fileUrl*` columns nulled and MinIO object deleted at finalize.
- [ ] A hard-reject Answer's files are still deleted (unchanged).
- [ ] An Answer re-saved to `approve` before finalize keeps its file (unchanged, verified by existing "latest-log-wins" read).
- [ ] `coverStatus`/grade/email selection in `finalize` is byte-for-byte unchanged for all existing test scenarios.

### Non-Functional

- [ ] Deletion failure still aborts finalize with `500` pre-transaction (regression-tested).

### Quality

- [ ] All acceptance criteria met
- [ ] Existing `evaluator-review.*.integration.test.ts` suite updated and passing
- [ ] Code reviewed and approved

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|---|---|---|---|
| 023-change-score-file-deletion | DDD | 001, 002 | Widen predicate + regression verification |

---

## Notes

This is a one-line predicate change (`status === "rejected" && verdictChoice === null` → `status === "rejected"`) plus variable/comment renaming, but it reverses a named, Must-priority ADR clause (ADR-0005 → ADR-0006), so it gets its own bolt and test-report artifact rather than being folded silently into another change.
