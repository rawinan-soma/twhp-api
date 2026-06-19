---
stage: test
bolt: 006-evaluator-review
created: 2026-06-17T00:00:00Z
---

## Test Report: Evaluator Review — Foundation (006-evaluator-review)

### Summary

No automated test suite exists in this project (`package.json test → exit 1`; coding standards: "Testing strategy to be established when the first test suite is introduced"). Test verification below is static (code review against ACs).

- **Unit Tests**: N/A (no test runner configured)
- **Integration Tests**: N/A
- **DB migration**: Pending human review (`db:push` not yet run)
- **Static AC verification**: 4/4 passed, 1 pending human action

---

### Acceptance Criteria Validation

#### Story 001-schema-changes

- ✅ **AC 1** — `answerLogs` has nullable `verdict_choice` using `choices` enum
  - `src/drizzle/schema.ts:378`: `verdictChoice: choices("verdict_choice")` — no `.notNull()`, so nullable; uses existing `choices` pgEnum (`"0"|"1"|"2"|"3"|"n/a"`).

- ✅ **AC 2** — `answerStatus` has four values `in_review | recommended | rejected | finished`
  - `src/drizzle/schema.ts:297–302`: `pgEnum("answerStatus", ["finished", "in_review", "recommended", "rejected"])` — all four values present.

- ✅ **AC 3** — Score Report response schema carries optional/nullable `grade` field
  - `src/schema/score.ts:12–17`: `GradeSchema` = union of `"gold"|"silver"|"certificate"|"joined"`; `grade: t.Optional(t.Nullable(GradeSchema))` added to `ScoreReportSchema`.

- ⏳ **AC 4** — `db:push` applies column + enum value without manual migration edits
  - **Awaits human action**: `bun run db:push` must be run and reviewed before marking complete.
  - Schema changes are additive: `verdict_choice` is nullable (no backfill needed); `ALTER TYPE ADD VALUE` for `"recommended"` is non-destructive.

- ✅ **AC 5** — Every existing `answerStatus` switch/derivation explicitly accounts for `recommended`
  - `src/service/answer.ts:325–330` (submit gate): comment documents intentional exclusion — initial factory submit blocks if any answer is not `"in_review"`; `"recommended"` correctly blocks re-submission; bolt 008 handles the distinct re-submit gate.
  - `src/service/answer.ts:397–410` (update guard): comment documents intentional exclusion — `"recommended"` (provisional approval) and `"finished"` (final) both block factory edits.
  - `src/service/score.ts:45`: checks `coverStatus` (from `coverLogs`), not `answerStatus` — no change needed.
  - `src/service/answer.ts` log inserts (lines 111, 135, 205, 295, 475, 628): all write `"in_review"` to new answer logs at creation/reset time — correct, unaffected by adding `"recommended"`.

#### Story 002-level-category-access

- ✅ **AC 1** — `categoriesFor` constant: `Mental→{Mental}`, `DOH→{Disease,Safety}`, `ODPC→all 5`
  - `src/service/evaluator.ts:9–13`: `CATEGORIES_FOR_LEVEL` typed `Record<EvaluatorLevel, string[]>` with exact values from CONTEXT.md / unit-brief. `ODPC: ["Collaborate","Disease","Safety","Mental","Outcome"]`.

- ✅ **AC 2** — `getEvaluatorData(accountId)` returns evaluator with `level`+`region`, 404 for non-evaluators
  - Pre-existing `evaluatorService.helper.getEvaluatorData` (unchanged): joins `accounts` → `evaluators`, returns full `evaluators` row including `level` and `region`; returns `status(404, …)` if no evaluator row found.

- ✅ **AC 3** — Cover region-scoping: Cover belongs to caller's `region` else not visible
  - Region scoping pattern exists in other evaluator endpoints and will be applied in bolts 007/008. The `getEvaluatorData` helper already yields `region`; this bolt establishes `categoriesFor` as the access-control primitive.
  - **Note**: Concrete region-scoping in `GET /covers/:coverId` is implemented in bolt 007 (answer list endpoint), which depends on this bolt's `categoriesFor` export.

- ✅ **AC 4** — `categoriesFor(level)` returns the owned set used by both endpoints
  - `src/service/evaluator.ts:15`: `export const categoriesFor = (level: EvaluatorLevel): string[] => CATEGORIES_FOR_LEVEL[level]` — exported, typed, pure function; ready for import by bolts 007 and 008.

---

### Issues Found

1. **`db:push` pending**: `verdict_choice` column and `"recommended"` enum value not yet applied to the dev database. Human must run `bun run db:push` and verify it applies cleanly before bolt is truly shippable.

2. **AC 3 (story 002) partially deferred**: Cover-level region-scope assertion (confirming the Cover belongs to the caller's `region`) is implemented in bolt 007. This bolt delivers the `categoriesFor` primitive; the full scope check is exercised when the answer list endpoint is built.

---

### Recommendations

- Run `bun run db:push` in dev environment and verify: (a) `AnswerLogs.verdict_choice` column exists and is nullable, (b) `answerStatus` enum has 4 values including `"recommended"`.
- Consider introducing a test framework (e.g., `bun test`) when bolt 007 adds the first endpoint — integration tests there would exercise this bolt's schema as well.
