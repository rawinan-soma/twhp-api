---
stage: test
bolt: 023-change-score-file-deletion
created: 2026-07-07T00:00:00.000Z
---

## Test Report: change-score-file-deletion

### Summary

- **Integration Tests (evaluator-review.verdict)**: 16/16 passed, 66 expect() calls
- **Integration Tests (evaluator-review.save + standards, regression)**: 25/25 passed, 51 expect() calls
- **Integration Tests (answer, regression)**: 3/3 passed, 18 expect() calls
- **Typecheck**: no new errors introduced in `src/service/evaluator-review.ts` (pre-existing unrelated errors in auth/test files untouched)
- **Lint (Biome)**: clean on `src/service/evaluator-review.ts`

### Acceptance Criteria Validation

**Story 001-widen-finalize-file-deletion**

- ✅ **change_score Answer's files deleted + fileUrl* nulled at finalize** — `evaluator-review.verdict.integration.test.ts`: "AC: hard-reject and change-score files are both deleted at finalize; recommended files preserved"
- ✅ **Hard-reject Answer's files still deleted (unchanged)** — same test, `hard-reject.pdf` asserted deleted + nulled
- ✅ **recommended/finished Answer files untouched** — same test, `recommended.pdf` preserved
- ✅ **Override before finalize (change_score → approve) keeps the file, no special-casing needed** — new test: "AC: an Answer change-score'd then re-saved to approve before finalize keeps its file" — asserts zero deletions and file survives, purely from the existing latest-log-wins read
- ✅ **MinIO deletion failure still aborts finalize with 500 pre-transaction** — existing test "AC (edge case): a MinIO delete failure aborts finalize before the txn" — unchanged, still passes (hard-reject case now folded into the same rejected-at-finalize set, no behavior change here)

**Story 002-regression-coverstatus-and-surface-parity**

- ✅ **coverStatus resolves to `in_progress`, grade `null`, for a Cover with a rejected (hard or change-score) Answer** — existing "AC: ≥1 rejected → one coverLog `in_progress`, no Grade" test, unchanged and still passing (change-score already counted toward `hasRejected` before this bolt — no new logic needed here, confirming the design's prediction)
- ✅ **All-recommended Cover still resolves to `finished` + computed grade** — existing "AC: all recommended → one coverLog `finished`..." test, unchanged and passing
- ✅ **Admin surface (region: null, existence-only access) finalizes with identical outcome** — existing "AC: a DOED admin (region null, existence-only access) may also finalize" test, unchanged and passing (shared `finalize` implementation — no surface-specific code exists to diverge)
- ✅ **Regression suite for `saveAnswerVerdict` (schema, authorship guard, standards enrichment)** — `evaluator-review.save.integration.test.ts` + `evaluator-review.standards.integration.test.ts`, 25/25 passing unchanged

### Issues Found

None.

### Recommendations

None — the change is fully covered by the existing test scaffolding (`mockDeleteStrict`, `seedCover`, `fileOf`, `latestOf`), requiring only two test-body edits and no new fixtures or helpers.
