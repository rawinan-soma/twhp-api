---
id: 002-regression-coverstatus-and-surface-parity
unit: 001-change-score-file-deletion
intent: 010-change-score-file-deletion
status: complete
priority: must
created: 2026-07-07T00:00:00.000Z
assigned_bolt: 023-change-score-file-deletion
implemented: true
---

# Story: 002-regression-coverstatus-and-surface-parity

## User Story

**As a** maintainer of the evaluator-review domain
**I want** proof that widening the file-deletion predicate did not change `coverStatus`, grade, or email behavior, and applies identically on both review surfaces
**So that** this intent stays scoped to file cleanup and doesn't silently regress ADR-0005's other invariants

## Acceptance Criteria

- [ ] **Given** a Cover with a `change_score`-flagged Answer, **When** `finalize` runs, **Then** `coverStatus` still resolves to `"in_progress"` and `grade` is still `null` — identical to pre-change behavior.
- [ ] **Given** a Cover where every Answer resolves to `recommended`/`finished` (no rejects, no change_score), **When** `finalize` runs, **Then** `coverStatus` resolves to `"finished"` with a computed grade — unchanged.
- [ ] **Given** the same finalize scenario run through `evaluators/covers/:coverId/finalize` and `admins/covers/:coverId/finalize`, **When** compared, **Then** both surfaces delete the same file set and produce the same `coverStatus`/grade outcome (shared `finalize` implementation, `adminReviewerContext` vs `resolveEvaluator`).
- [ ] **Given** the existing `evaluator-review.*.integration.test.ts` suite, **When** updated for this change, **Then** it includes at least one case asserting a `change_score` Answer's files are gone post-finalize, alongside the existing hard-reject and preserved-file cases.

## Technical Notes

- No production code changes expected beyond story 001 — this story is verification/regression-test coverage.
- Relevant existing test files: `src/service/evaluator-review.verdict.integration.test.ts`, `src/service/evaluator-review.save.integration.test.ts`, `src/service/evaluator-review.standards.integration.test.ts`.

## Dependencies

### Requires

- 001-widen-finalize-file-deletion

### Enables

- None (last story in this unit)

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Cover has both change_score and fully-recommended Answers | `hasRejected` still trips on the change_score Answer → `in_progress`, no grade |
| Admin-as-ODPC finalize on a Cover with a change_score Answer | Same file deletion + same coverStatus outcome as the evaluator surface |

## Out of Scope

- Any new email template or notification content changes.
- Performance testing (no volume/throughput characteristics change).
