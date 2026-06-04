---
stage: test
bolt: 001-score-service
created: 2026-06-03T00:00:00Z
---

## Test Report: Score Service (Bolt 001)

### Summary

- **Unit Tests**: 20/20 passed
- **Integration Tests**: 0 — deferred (no test DB setup; see Story 003 note)
- **Security Tests**: N/A (read-only service, auth enforced at route layer in bolt 002)
- **Performance Tests**: N/A (no load test infra yet)

**Test runner**: `bun test` (Bun native)
**Test file**: `src/service/score.test.ts`
**Helpers module**: `src/service/scoreHelpers.ts` (zero-dependency, fully testable)

---

### Acceptance Criteria Validation

#### Story 001 — Score Formula

- ✅ **AC1**: choices `["3","2","1","0"]` → `scoreGroup` returns `50`
- ✅ **AC2**: all `"n/a"` → returns `0` (division-by-zero guard)
- ✅ **AC3**: mix `"3"` + `"n/a"` → `n/a` excluded from denominator → `100`
- ✅ **AC4**: all `"3"` → `100`
- ✅ **AC5**: all `"0"` → `0`
- ✅ **AC6**: `special` field has no effect — same input yields same output regardless

#### Story 002 — Category Breakdown

- ✅ **AC1**: all 5 category keys present in `calculateBreakdown` response
- ✅ **AC2**: category with no answers → score `0`
- ✅ **AC3**: category with only `n/a` answers → score `0`
- ✅ **AC4**: all `"3"` in Collaborate → `collaborate = 100`
- ✅ **AC5**: `totalScore` = all answers combined (not average of category scores) — verified with asymmetric fixture

#### Story 003 — Cover Status Guard

- ⚠️ **AC1**: `in_progress` cover → `status(400, { message: "cover is not ready for scoring" })` — **DEFERRED** (requires test DB with CoverLogs fixture)
- ⚠️ **AC2**: `in_review` cover → 200 with ScoreReport — **DEFERRED**
- ⚠️ **AC3**: `finished` cover → 200 with ScoreReport — **DEFERRED**
- ⚠️ **AC4**: no cover → `status(404, { message: "cover not found" })` — **DEFERRED**

Story 003 ACs are verified by code review: the guard logic (`coverStatus === "in_progress"` → `status(400,…)`, `!coverRow` → `status(404,…)`) is directly readable in `createScoreService`. Integration tests can be added when a test DB fixture is introduced.

#### Story 008 — Score Report Shape

- ✅ **AC1 & AC2**: `ScoreReportSchema` validates well-formed report with all required fields
- ✅ **AC2**: non-integer score field fails validation
- ✅ **AC2**: score value below 0 fails validation
- ✅ **AC2**: score value above 100 fails validation
- ✅ **AC2 edge**: score value `0` is valid (minimum boundary)
- ✅ **AC2 edge**: score value `100` is valid (maximum boundary)
- ✅ **AC3**: `ScoreReportListSchema` validates array of reports
- ✅ **AC3**: `ScoreReportListSchema` validates empty array
- ✅ **AC1**: missing required field fails schema validation

---

### Issues Found

None. All pure-function ACs pass. Story 003 integration ACs deferred — not a blocker for bolt completion since the guard code is straightforward and readable.

### Recommendations

1. Introduce a test DB fixture (e.g. a local Postgres container seeded per-test) to cover Story 003 ACs.
2. Consider a `tests/` folder convention: `tests/unit/` for pure logic, `tests/integration/` for DB-dependent service methods.
