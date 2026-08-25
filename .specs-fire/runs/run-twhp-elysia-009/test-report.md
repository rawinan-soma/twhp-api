---
run: run-twhp-elysia-009
work_item: standard-file-deletion-on-hard-reject
intent: score-change-finality
generated: 2026-08-25T09:30:00Z
status: passing
---

# Test Report: Hard reject deletes the standard certificate too

## Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Full suite (`bun test`) | 537 | 0 | 1 |
| `evaluator-review.verdict.integration.test.ts` | 30 | 0 | 0 |

Grew 23 → 30 tests across two new describes.

## Acceptance Criteria Validation

- ✅ **Every standard the rejected question names and the factory claims is deleted** — rejecting q23 deletes its five certificates; `standard5S`, which q23 does not name, survives with its file.
- ✅ **Unclaimed standards are not deleted** — with `standardZero` false, only four certificates are deleted.
- ✅ **A shared certificate is deleted once** — q23 and q26 both name `standardSafety`; `cert-safety.pdf` appears exactly once in the delete batch.
- ✅ **Booleans and urls cleared** — asserted on the enrollment row after finalize.
- ✅ **Not-yet-`finished` collateral → `in_review`** — q22 shares `standardSafety` with q23 and returns to `in_review` rather than being promoted.
- ✅ **Already-`finished` collateral untouched** — q25 keeps `finished` and gains no further log rows.
- ✅ **Unrelated answers promote normally** — a Mental answer naming no standard reaches `finished`.
- ✅ **A score change deletes nothing** — a standard-backed `change_score` finalizes to `finished` with every certificate intact.
- ✅ **Deletion is outside and before the transaction** — unchanged pipeline; the pre-existing MinIO-failure test still passes.
- ✅ **`bun test` passes** — 537/0.

## Tests Written

- `Hard reject deletes the standard certificates behind the question` (4 tests)
- `Collateral answers scored from a deleted certificate` (3 tests)
- Fixture: `seedCover` accepts a `questionId` override so the standard-backed questions
  (q22/q23/q25/q26) can be seeded; `claimStandards()` and `enrollStandards()` helpers.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Building the widened `enrollData` select by spreading `STANDARD_ENROLL_COLUMNS` collapsed Drizzle's column inference — the row degraded to `{ Accounts: any; Covers: any; … }` and broke four existing references | medium | **Fixed** — the eleven pairs are enumerated explicitly, matching the precedent already in this file; a comment explains why the map cannot drive the select |
| 32 pre-existing `tsc --noEmit` errors | low | Unchanged (32 before, 32 after) |

## Ready for Completion

- [x] All tests passing
- [x] All acceptance criteria validated
- [x] No critical issues open
