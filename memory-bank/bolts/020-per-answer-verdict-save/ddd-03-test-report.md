---
stage: test
bolt: 020-per-answer-verdict-save
created: 2026-07-02T08:39:05Z
---

## Test Report: ODPC Finalize (whole-Cover resolution)

### Summary

- **Integration Tests**: 15/15 passed (61 `expect()` calls), ~360ms — `bun test src/service/evaluator-review.finalize.integration.test.ts`
- **Unit Tests**: n/a — no unit-test framework in the project; the service is exercised through integration tests against a real Postgres (project convention, same as bolt 019).
- **Security Tests**: covered within the integration suite (ODPC-only gate 403 for tier-1 Mental/DOH; cover-access 404 for wrong region).
- **Performance Tests**: n/a for this bolt (one indexed read + one bulk insert + one insert; no NFR perf target beyond atomicity).

Tests derive **only** from story-004 ACs; each test name references the AC it covers. No test asserts a code path absent from a story-004 AC. Runs against the live docker stack (Postgres/Redis/MinIO). `emailQueue.add` is stubbed so the running dev worker never fires real SMTP.

### Acceptance Criteria Validation

**Story 004 — odpc-finalize-action**
- ✅ **AC1** tier-1 (Mental) finalize → `403`, no coverLog, no email
- ✅ **AC1** tier-1 (DOH) finalize → `403`
- ✅ **AC1** wrong-region regional ODPC → `404` (cover access)
- ✅ **AC2** reads persisted logs (no batch arg) — already-`finished` answer stays finished, no duplicate promotion
- ✅ **AC3** any Answer still `in_review` → `400`; no promotion, no `in_review` verdict invented, no coverLog, no email
- ✅ **AC4** un-overridden `recommended` → `finished` for tier-1 approvals, ODPC's own approvals, and factory-accepts; promotion log authored by the finalizer (`eval_id`)
- ✅ **AC5** deferred deletion: strict delete invoked for exactly the hard-reject (`verdict_choice` null) file (asserted via spy) + its columns nulled in-txn; change-score & recommended files preserved
- ✅ **AC5 / edge case** a MinIO delete failure aborts finalize **before** the txn → `500`, no `coverLogs`, recommended not promoted, file not nulled, no email (no partial transition)
- ✅ **AC6** all `finished` → exactly one `coverLogs` `finished` with `evaluatorId` + a computed **Grade** in the response
- ✅ **AC7** ≥1 `rejected` → exactly one `coverLogs` `in_progress`, `grade` null; settled `recommended` still promoted to `finished`
- ✅ **AC8** exactly one factory email per outcome — `verdict-result-finished` (with grade) / `verdict-result-in-progress` (no grade), correct `email`+`factoryNameTh`
- ✅ **AC8** a DOED admin (region null, existence-only access) may also finalize
- ✅ **AC9 / FR-5** save path (ODPC approve) writes `recommended`, never `finished`; only the subsequent finalize promotes to `finished`
- ✅ **AC9** promotions + the `coverLogs` transition commit together (atomic)

### Issues Found

None. All 15 tests pass; every story-004 AC (including the MinIO-failure edge case) maps to at least one passing test.

### Notes / Deviations

- **Strict delete added to satisfy the story-004 "MinIO delete fails → surfaces before txn" edge case.** The initial implementation reused `utilities().deleteFile`, which **swallows** MinIO errors (pre-existing best-effort behavior), so a delete failure did **not** abort finalize. To honor the story edge case, a **new** non-swallowing `utilities().deleteFileStrict` was added; finalize now uses it and, on failure, returns `status(500)` **before** the transaction → no partial cover transition (verified by the edge-case test: no `coverLogs`, no promotion, file not nulled, no email). The existing `deleteFile` (best-effort) is **unchanged** for its other callers (`enroll.ts`, `answer.ts`). The `500` is logged by the global `onAfterResponse` handler (status ≥ 400), so no ad-hoc `console.error` was added. DB-transaction atomicity (promotions + file-column null-out + the single `coverLogs` row) is preserved and separately tested.
- **`verdict()` / `VerdictBatch` intentionally retained** in `evaluator-review.ts` (their removal is bolt 021, per the construction-log replanning note). So a project-wide grep still shows the legacy batch method writing `finished`; FR-5's "no *save* path writes finished" holds for the new `saveAnswerVerdict` path, which is what story 004 governs.
- **No re-finalize guard added.** The old `verdict()` had no "cover already finalized" precondition; to preserve "end-state identical to the old batch model," none was invented. A second finalize on an already-`finished` cover behaves as the old code would (empty promotions, `finished` outcome, duplicate coverLog + email). Hardening would be a follow-up (arguably an ADR-0004 addendum), not part of story-004 ACs.
- **`tsc --noEmit`**: the new `finalize.integration.test.ts` and the modified `service/evaluator-review.ts` are clean; the 12 project-wide errors are all pre-existing and confined to unrelated in-flight files (`authentication/*`, `answer.integration.test.ts`). **Biome**: clean apart from one `noNonNullAssertion` warning on `Bun.env.DATABASE_URL!`, matching every existing integration-test file.
- Coverage tool not run (no project coverage config); the AC-to-test mapping above is the completeness measure.

### Recommendations

- **Bolt 021** wires the `POST …/covers/:coverId/finalize` route on both surfaces (evaluators + admins), removes the batch `verdict` routes + `VerdictBatchSchema`/`verdict()`, restructures the legacy `evaluator-review.integration.test.ts` / `.verdict.integration.test.ts`, and regenerates the OpenAPI docs. At that point the FR-5 grep-invariant becomes literally true across the whole codebase.
- Consider formalizing a `FinalizeResultSchema` (`{ coverStatus, grade }`) as the route's OpenAPI response DTO in bolt 021.
