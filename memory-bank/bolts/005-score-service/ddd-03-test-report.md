---
stage: test
bolt: 005-score-service
created: 2026-06-12T11:20:00Z
---

## Test Report: score-service (FR-9 breakdown restructure)

### Summary

- **Unit Tests** (`src/service/score.test.ts`): 24/24 passed, 48 `expect()` calls, ~133ms. Runs without a DB.
- **Integration Tests** (`src/service/score.integration.test.ts`): shape assertions migrated to nested `scoring`; **DB-gated** (requires `DATABASE_URL`) — not executed in this environment.
- **Production type-check** (`bunx tsc --noEmit`): **0 errors** in production code.

### Tests derived from Story 009 ACs (story-orientation rule)

All tests trace to story-009 acceptance criteria — none written for code paths outside the ACs.

- ✅ **009 — group reports scoredCount/maxScore/achievedScore/percentage**: `["3","2","1","0"]` → `{4,12,6,50}`.
- ✅ **009 — n/a excluded from count/max/achieved**: `["3","n/a","n/a"]` → `{1,3,3,100}`.
- ✅ **009 — maxScore === 3 × scoredCount (all groups)**: asserted across `Object.values(breakdown)`.
- ✅ **009 — percentage === round(achieved/max×100) when scoredCount>0**: `["2","2"]` → 67.
- ✅ **009 — empty group → all four zero**: `["n/a","n/a"]` → `{0,0,0,0}`.
- ✅ **009 — total consistency**: total counts/achieved/max equal the sum across the 5 categories.
- ✅ **009 — worked example**: 50 non-n/a summing 120 → `{50,150,120,80}`.
- ✅ **009 — nested `scoring` keyed total + 5 categories**: schema validates well-formed nested report.
- ✅ **009 — flat fields removed (breaking)**: a legacy flat-shaped report FAILS `ScoreReportSchema`; missing `scoring` FAILS.
- ✅ **009 — percentage integer 0–100; counts non-negative**: 80.5 / 101 / -1 rejected; 0 and 100 accepted.
- ✅ **009 — single + list both carry scoring**: `ScoreReportSchema` + `ScoreReportListSchema` (incl. empty array).

### Regression — unchanged behaviour still covered

- ✅ **Story 001** formula via `percentage` (50 / 0 / 100 / 67; all-n/a guard).
- ✅ **Story 002** breakdown keys (`total` + 5 categories); total uses combined answers, not the average of category percentages.
- ✅ **Story 008** report shape now nested; required-field validation preserved.
- ⏸️ **Story 003** cover-status guard (in_progress→400 / no-cover→404) — unchanged by this bolt; covered by the DB-gated integration test.

### Acceptance Criteria Validation

- ✅ **009-scoring-breakdown-fields** — every AC has a corresponding passing unit test (see mapping above).

### Issues Found

- `score.integration.test.ts` carries **5 pre-existing type errors** unrelated to this bolt (subquery `.districtId`/`.subdistrictId` typing on lines 104/109; `ElysiaCustomStatusResponse` missing generic args on 175/182/183). They predate FR-9 and were not introduced by the shape migration. **Left as-is** (out of scope); recommend a separate cleanup.
- `routes/authentication/index.test.ts` — 3 pre-existing errors from the 2FA work; unrelated.

### Recommendations

- **Consumer migration** is required before release: frontend + any API client must move from `totalScore`/`collaborate`/… to `scoring.<group>.percentage`. Flag in release notes (breaking change).
- Run the DB-gated integration suite (`DATABASE_URL=… bun test src/service/score.integration.test.ts`) in an environment with a seeded test DB to validate the nested shape end-to-end.
- Optional follow-up: clean up the pre-existing integration-test type errors.
