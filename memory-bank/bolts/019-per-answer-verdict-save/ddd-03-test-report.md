---
stage: test
bolt: 019-per-answer-verdict-save
created: 2026-07-02T07:39:52Z
---

## Test Report: Per-Answer Verdict Save (write path)

### Summary

- **Integration Tests**: 19/19 passed (34 `expect()` calls), 441ms — `bun test src/service/evaluator-review.save.integration.test.ts`
- **Unit Tests**: n/a — no unit-test framework in the project; the service is exercised through integration tests against a real Postgres (project convention).
- **Security Tests**: covered within the integration suite (category scope 403, authorship guard 403/400, cover-access 404).
- **Performance Tests**: n/a for this bolt (single-INSERT write path; no NFR perf target beyond durability).

Tests derive **only** from story ACs (stories 001/002/003); test names reference the AC they cover. No test asserts a code path absent from a story AC.

### Acceptance Criteria Validation

**Story 001 — VerdictSaveBodySchema / FinalizeSchema**
- ✅ approve body needs neither `verdictChoice` nor `description`
- ✅ `change_score` requires `verdictChoice` (`0–3`) + `description` (invalid choice / missing desc rejected)
- ✅ `reject` requires `description`
- ✅ `answerId` not required by the save body (path param)
- ✅ `FinalizeSchema` accepts `{}`

**Story 002 — saveAnswerVerdict**
- ✅ tier-1 (Mental) approve → `recommended`
- ✅ **ODPC approve → `recommended` (NOT `finished`)** — the FR-5 invariant
- ✅ `change_score` → `rejected` + `verdict_choice` + `description`
- ✅ `reject` → `rejected` + null `verdict_choice` + `description`
- ✅ no-op `change_score` (== live choice `2`) → 400
- ✅ out-of-scope category (Mental on Disease) → 403
- ✅ answer not in this cover → 400
- ✅ cover not accessible (wrong region) → 404
- ✅ no side effects — no `coverLogs` transition **and** `emailQueue.add` not called

**Story 003 — authorship-keyed edit guard**
- ✅ `finished` immutable to everyone incl. ODPC → 400
- ✅ tier-1 may re-edit its OWN `recommended` → 200
- ✅ a different non-ODPC author cannot edit someone else's `recommended` → 403 (Factory-accept protection analogue)
- ✅ ODPC may override any `recommended` → 200
- ✅ a `rejected` answer is re-editable by a scoped reviewer → 200

### Issues Found

None. All 19 ACs map to a passing test.

### Notes / Deviations

- **`VerdictBatchSchema` removal deferred to bolt 021** (see construction-log scope-change 2026-07-02): bolt 019 is additive so the build stays green while bolts 020/021 still depend on the batch method/routes. Story 001's deletion AC is therefore carried to bolt 021.
- **Project-wide `tsc --noEmit`** reports errors only in unrelated in-flight files (`authentication/*`, `answer.integration.test.ts`, `score.integration.test.ts`); the bolt-019 files (`schema/evaluator-review.ts`, `service/evaluator-review.ts`, `evaluator-review.save.integration.test.ts`) are clean. Biome: clean (one `noNonNullAssertion` warning on `Bun.env.DATABASE_URL!`, matching existing test files).
- Coverage tool not run (no project coverage config); AC-to-test mapping above is the completeness measure.

### Recommendations

- Bolt 020 (`finalize`) should reuse the same integration-harness pattern and assert the `recommended → finished` conversion + cover transition that this bolt deliberately does not produce.
