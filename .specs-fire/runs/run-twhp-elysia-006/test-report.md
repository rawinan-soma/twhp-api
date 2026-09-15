---
run: run-twhp-elysia-006
work_item: finalize-settles-score
intent: score-change-finality
generated: 2026-08-24T05:40:00Z
status: passing
---

# Test Report: Finalize settles the verdict score and spares its evidence

## Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Full suite (`bun test`) | 524 | 0 | 1 |
| `evaluator-review.verdict.integration.test.ts` | 23 | 0 | 0 |

Grew 17 → 23 tests. One pre-existing test was rewritten rather than deleted: the ADR-0006 case
asserting change-score files are deleted now asserts they are preserved, and its seeded row
doubles as the legacy-shape fixture.

## Acceptance Criteria Validation

- ✅ **Deletion set = hard rejects only** — a `rejected` + `verdictChoice` row keeps its file; only the null-verdict reject is deleted.
- ✅ **Cover finishes in one pass** — score-change-only Cover → `finished`.
- ✅ **`selectedChoice := verdictChoice` in the transaction** — asserted via `choiceOf`.
- ✅ **Grade reflects the correction** — a Cover corrected to `0` across every category grades differently from the same Cover left at `2`.
- ✅ **Legacy rows settle with no backfill** — dedicated test: no deletion, score applied, `finished`, no bounce.
- ✅ **Hard reject unchanged** — bounces the Cover, deletes only its own file; a score change in the same Cover still settles.
- ✅ **Promotion row carries `verdictChoice` forward** — asserted on the `finished` log.
- ✅ **`in_review` hard gate unchanged** — pre-existing tests passing.
- ✅ **MinIO failure still aborts before any DB write** — pre-existing test passing.
- ✅ **`bun test` passes** — 524/0.

## Tests Written

- `Settled score changes at finalize` (6 tests) — one-pass finish, promotion row retention, Grade
  correction, legacy-row settlement, mixed hard-reject Cover, and re-finalize idempotence.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| **Self-inflicted regression caught before completion**: widening promotions from `status === "recommended"` to "not hard-rejected" swept in Answers already `finished` by a previous finalize of a bounced Cover, appending duplicate `finished` logs on every subsequent pass | medium | **Fixed** — an `open` set excludes `finished` from classification, promotion, and settling; locked by a re-finalize test |
| Docker/OrbStack was down mid-run, so an earlier suite run reported 16 failures and 111 skips | none | Environment only; OrbStack restarted, suite green |
| 32 pre-existing `tsc --noEmit` errors | low | Unchanged by this run (32 before, 32 after) |

## Ready for Completion

- [x] All tests passing
- [x] All acceptance criteria validated
- [x] No critical issues open
