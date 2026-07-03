---
stage: test
bolt: 022-review-standard-files
created: 2026-07-03T03:06:16Z
---

## Test Report: Standard Files in the Cover-Review Read

### Summary

- **Integration Tests**: 50/50 passed (135 `expect()` calls), ~510ms —
  `bun test src/service/evaluator-review.integration.test.ts src/service/evaluator-review.save.integration.test.ts src/service/evaluator-review.verdict.integration.test.ts src/service/evaluator-review.standards.integration.test.ts`
  - `evaluator-review.standards.integration.test.ts` — **new** bolt-022 suite (6 cases); seeds enroll standard files (seed data has none).
  - `evaluator-review.integration.test.ts` — the intent-008 `getAnswers` regression, **updated** to the `{ answers, standards }` shape.
  - `evaluator-review.save`/`verdict` — unchanged, still green (no regression from the read-shape change).
- Runs against the live docker stack (Postgres/Redis/MinIO). No new external dependency exercised (files resolved later via `/file`).

### Acceptance Criteria Validation

**Story 001 — DTO**
- ✅ `StandardFileItemSchema = { standard, fileName }`; `standard` is the `standardTypes` key set (explicit literal union + `_standardKeysInSync` compile-time guard)
- ✅ `AnswerViewSchema` → `{ answers: AnswerViewItem[], standards: StandardFileItem[] }`; `AnswerViewItemSchema` unchanged (regression: admin list still `Value.Check(AnswerViewSchema, body(result))`)

**Story 002 — service enrichment**
- ✅ `getAnswers` returns `{ answers, standards }`; `answers` unchanged (region/category scope, per-answer status — asserted in the regression suite)
- ✅ standards = **claimed + uploaded only**: seeded HC+ISO45001 (claimed+file) present; SAN (claimed, no file) absent; Safety (not claimed, stray file) absent
- ✅ derived from the enroll via `STANDARD_ENROLL_COLUMNS` (single source of truth); one `covers→enrolls` read, no N+1
- ✅ empty-answers cover still returns standards (`{ answers: [], standards: [...] }`)
- ✅ cover access unchanged — wrong-region ODPC → `404`, no standards leaked

**Story 003 — both surfaces**
- ✅ both `/answers` routes carry the new shape (single `AnswerViewSchema`); admin (region null) returns the **same** `standards` as a regional ODPC
- ✅ standards are **factory-level** — a tier-1 (Mental) reviewer's answers are category-filtered to 1, but `standards` still contains both claimed standards

**Story 004 — docs + regression**
- ✅ `docs/api/openapi.json` + `API.md` + `index.html` regenerated (the cover-review responses now carry `standards`)
- ✅ the intent-008 `getAnswers` regression updated to the new shape and green; answers filtering/projection still asserted unchanged
- ✅ full evaluator-review suite passes (50/50)

### Issues Found

None. All story 001–004 ACs map to passing tests.

### Notes / Deviations

- **`getAnswers` now returns `status(200, { answers, standards })`** (was a bare value) — aligning it with the rest of the service (`saveAnswerVerdict`/`finalize` all return `status(...)`). This also resolved an Elysia handler-typing failure; callers/tests read `body(result)` accordingly.
- **Elysia mapped-union pitfall (fixed):** `t.Union(standardTypes.enumValues.map(t.Literal))` compiled but broke the `/answers` route response-type inference (bisected: `standard: t.String()` cleared it). Replaced with an **explicit literal tuple** + a `_standardKeysInSync` compile-time guard so the pgEnum stays the source of truth without the mapped-array degradation.
- **`standardBoolMap`/`standardUrlMap` are not exported** (inline in `answer.ts`, 3×, for a different question↔standard computation). Bolt 022 introduces one authoritative `STANDARD_ENROLL_COLUMNS` + `standardFilesFromEnroll` (in `evaluator-review.ts`) rather than a 4th copy; `answer.ts` is left untouched (optional future dedup).
- **CSV-import gap:** a claimed-but-unuploaded standard (possible only via `migrate-prod`, which bypasses the API guard) is **omitted** (per the approved requirement). The suite covers this via a directly-seeded `standardSan: true, fileStandardSanUrl: null` row (asserted absent).
- **`tsc --noEmit`**: the new/changed evaluator-review source + tests are clean; remaining project-wide errors are all pre-existing and confined to unrelated files (`authentication/*`, `answer.integration.test.ts`, `score.integration.test.ts`). **Biome**: clean apart from the shared `Bun.env.DATABASE_URL!` warning in the integration tests.

### Recommendations

- Frontend: adopt the `{ answers, standards }` shape and render each `standards[].fileName` via `GET /file/presigned-url` (same as per-answer evidence files).
- Optional follow-up: dedup `answer.ts`'s inline standard maps onto `STANDARD_ENROLL_COLUMNS` (out of scope here).
