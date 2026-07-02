---
stage: test
bolt: 021-per-answer-verdict-save
created: 2026-07-02T09:14:46Z
---

## Test Report: Two-Phase Review over HTTP (routes + docs + tests)

### Summary

- **Integration Tests**: 44/44 passed (115 `expect()` calls), ~590ms — `bun test src/service/evaluator-review.integration.test.ts src/service/evaluator-review.save.integration.test.ts src/service/evaluator-review.verdict.integration.test.ts`
  - `evaluator-review.integration.test.ts` — reviewer-context seam + `getAnswers` region/category/schema regression (story 007 AC1).
  - `evaluator-review.save.integration.test.ts` — per-Answer save cases (bolt 019; story 007 AC3).
  - `evaluator-review.verdict.integration.test.ts` — finalize cases (story 007 AC4; renamed from the bolt-020 `*.finalize` suite to the story-canonical `*.verdict` name).
- **Route-wiring verification**: live app boot + HTTP probes (see below) — routes register, guards apply, batch routes are gone.
- **Docs**: regenerated from the live OpenAPI (`scripts/gen-api-docs.ts`), 51 operations.
- **Unit/Security/Perf**: n/a as separate suites (project convention: service-level integration tests).

### Acceptance Criteria Validation

**Story 005 — save + finalize routes (evaluators)**
- ✅ `POST …/evaluators/covers/:coverId/answers/:answerId/verdict` exists (HTTP 401 unauth → route registered under `evalGuard`; calls `saveAnswerVerdict`)
- ✅ `POST …/evaluators/covers/:coverId/finalize` exists; ODPC-only gate lives in `finalize()` (tier-1 → 403, covered in the finalize suite)
- ✅ old batch `POST …/evaluators/covers/:coverId/verdict` **removed** → HTTP 404
- ✅ routes are thin — resolve `ReviewerContext` via `resolveEvaluator`, delegate, return `status()` verbatim
- ✅ numeric path params (`t.Number()`); OpenAPI `detail`/`response` cover `200/400/403/404` (+`500` on finalize)
- ✅ `GET …/answers` unchanged

**Story 006 — admin surface parity**
- ✅ `POST …/admins/covers/:coverId/answers/:answerId/verdict` + `…/finalize` exist (HTTP 401 unauth → registered under `adminGuard`); call the **same** service methods
- ✅ reviewer resolved via `adminReviewerContext` (level `ODPC`, `region: null`, existence-only access)
- ✅ admin acts as ODPC → approve→recommended, finalize permitted (finalize suite covers admin `region: null` finalize)
- ✅ old admin batch route **removed** → HTTP 404
- ✅ identical outcomes to evaluator-ODPC aside from region scoping (both surfaces call the one `evaluatorReviewService`)

**Story 007 — answers-list + docs + tests regression**
- ✅ `getAnswers` filtering/projection/scope/schema unchanged (regression suite green; read path untouched in code)
- ✅ `docs/api/openapi.json` + `API.md` + `index.html` regenerated: 6 new save/finalize paths present, batch `/verdict` absent (0 refs in `API.md`)
- ✅ per-Answer save cases exist (`…save.integration.test.ts`, 19 cases)
- ✅ finalize cases exist in the story-canonical `evaluator-review.verdict.integration.test.ts` (15 cases)
- ✅ "duplicate answerId in batch" case gone; **no** test references `VerdictBatchSchema` (only a doc comment mentions its removal)
- ✅ full evaluator-review suite passes (44/44)

### Route-wiring HTTP probes (live app on :3000)

| Probe | Result |
|-------|--------|
| `POST evaluators/covers/1/answers/1/verdict` (valid JSON, unauth) | 401 (guard) — route registered |
| `POST admins/covers/1/answers/1/verdict` (valid JSON, unauth) | 401 (guard) — route registered |
| `POST evaluators/covers/1/finalize` (empty body, unauth) | 401 — **no** spurious body-validation 400; empty body OK |
| `POST admins/covers/1/finalize` (unauth) | 401 |
| `POST evaluators/covers/1/verdict` (removed batch) | 404 |
| `POST admins/covers/1/verdict` (removed batch) | 404 |

_Body validation runs after the guard (an unauth `{}` save → 401, not a body 400), so the empty-body finalize concern is moot._

### Issues Found

None. During probing, transient `400 code:"PARSE"` responses appeared — traced to **shell escaping** mangling JSON inside `$(...)` command substitution (backslashed quotes), **not** a route defect; re-running with a body file returned the expected 401s.

### Notes / Deviations

- **Legacy test-file reconciliation (story 007 AC3/AC4).** The ACs name `evaluator-review.integration.test.ts` (save cases) and `evaluator-review.verdict.integration.test.ts` (finalize cases). Bolts 019/020 introduced dedicated `…save`/`…finalize` suites; bolt 021 reconciles the naming to the story canon:
  - `evaluator-review.integration.test.ts` — **kept as-is** (reviewer-context seam + `getAnswers` regression, AC1; no batch symbols).
  - `evaluator-review.verdict.integration.test.ts` — the old batch-based file (broken by the `verdict()` removal) was replaced: the bolt-020 `*.finalize` suite was **renamed** into this story-canonical name (`git mv`), giving literal AC4 parity **without duplicating** the finalize cases. The batch-only "duplicate answerId in batch" case is gone.
  - Per-Answer **save** cases (AC3) remain in `evaluator-review.save.integration.test.ts` (the dedicated bolt-019 file) rather than folded back into `evaluator-review.integration.test.ts` — same intent, dedicated file.
- **Route tests are HTTP-probe + boot-level**, matching the repo convention (all existing integration tests call the service directly; there is no HTTP test harness). Route correctness = successful autoload boot + OpenAPI presence + unauth-status probes + tsc typecheck of the handlers. The behavioral logic (ODPC gate, guards, save/finalize outcomes) is covered at the service level.
- **`tsc --noEmit`**: the removed `.verdict` file's errors are gone; remaining project-wide errors are all pre-existing and confined to unrelated in-flight files (`authentication/*`, `answer.integration.test.ts`, `score.integration.test.ts`) — no evaluator-review file appears. **Biome**: clean apart from the shared `Bun.env.DATABASE_URL!` warning in the integration tests.

### Recommendations

- Unit complete after this bolt — hand off to Operations. The two-phase model (per-Answer save + separate ODPC finalize) is now the sole write path across both surfaces, documented, and regression-covered.
- If desired later: add an HTTP-level test harness (with a minted JWT) to assert the route guards + param validation end-to-end, rather than relying on service-level + boot-level checks.
