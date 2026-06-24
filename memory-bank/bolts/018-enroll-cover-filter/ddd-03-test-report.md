---
stage: test
bolt: 018-enroll-cover-filter
created: 2026-06-24T07:18:18Z
---

## Test Report: enroll-cover-filter

### Summary

- **Integration tests (new)**: 12/12 passed — `src/service/enroll.integration.test.ts`
- **Regression (verdict suite)**: 8/8 passed — `src/service/evaluator-review.verdict.integration.test.ts` (unchanged)
- **Combined run**: 20/20 passed, 77 assertions
- **Lint**: biome clean on all 6 touched files (1 pre-existing-style warning: `DATABASE_URL!` non-null assertion, matching every other integration test)
- **Types**: no new tsc errors in the 6 files (the 11 repo-wide errors are pre-existing in `authentication/*` and `score.integration.test.ts`)

Tests are derived from story ACs only. The suite seeds two factories in two
different health regions, four enrolls under factory A (covers: finished —
preceded by an in_progress log to prove latest-log-wins —, in_progress,
in_review, and one with no cover) and one finished enroll under factory B for
scope-exclusion. Region/province are read live, not hard-coded.

### Acceptance Criteria Validation

**Story 001 — cover-status derivation and filter**
- ✅ enroll with cover → `coverId` + latest `coverStatus` (latest-log-wins): cover seeded `[in_progress, finished]` resolves to `finished`
- ✅ enroll with no cover → `coverId` null, `coverStatus` null
- ✅ `coverStatus=finished` → only finished; in_progress/in_review/no-cover excluded; every returned row is finished
- ✅ `coverStatus=in_progress` → only in_progress
- ✅ `coverStatus=in_review` → only in_review
- ✅ `coverStatus=none` → only no-cover enrolls (coverId/coverStatus null)
- ✅ no filter → all in-scope enrolls incl. no-cover, every row enriched
- ✅ AND-combined with REGION scope: `getAllEnrolls(regionA,_, 'finished')` includes A's finished, excludes B's finished
- ✅ AND-combined with PROVINCE scope: `getAllEnrollsByProvince(PROVINCE_A, 'finished')` excludes province B; unfiltered province query still enriches + includes no-cover

**Story 002 — shared response schema**
- ✅ enriched rows incl. null cover fields conform to `EnrollWithCoverListSchema` (`Value.Check`)
- ✅ no-cover enroll serialized as null/null (verified in subset check + Story 001)
- ✅ all three routes reference the single shared `EnrollWithCoverListSchema` (structural — same import in all 3 route files)
- ✅ existing fields unchanged (additive schema; verdict regression green)

**Story 003 — coverStatus query contract**
- ✅ query `t.Object({ coverStatus: CoverStatusQuery })` accepts `finished|in_progress|in_review|none` and omission
- ✅ rejects invalid values (`FINISHED`, ``, `done`, `in-progress`, `1`) → backs the 400-at-boundary behaviour
- ✅ valid value forwarded to the correct service signature (admin/evaluator/provincial) — structural in route code; service behaviour covered by Story 001 tests

### Issues Found

None.

### Recommendations / Flags

- **Route-level 400 + JWT scope mount (FLAGGED)**: the HTTP 400 short-circuit and the evaluator/provincial JWT scope resolution are enforced by TypeBox + shared guards + elysia-autoload — the same wiring as sibling routes. They are validated indirectly (query-schema checks back the 400; service-level scope composition is directly tested) rather than via a full route mount, because an isolated mount does not reproduce the autoload scope-composition pipeline (same caveat documented in `evaluator-review.integration.test.ts`). Verify the 400/scoping end-to-end via the running app or e2e if desired.
- No N+1 confirmed by design (≤2 bounded queries); not separately load-tested (out of scope for this bolt's NFR bar).
