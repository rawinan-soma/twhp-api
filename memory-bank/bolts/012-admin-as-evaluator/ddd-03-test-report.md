---
stage: test
bolt: 012-admin-as-evaluator
created: 2026-06-19T02:01:44Z
---

## Test Report: admin-as-evaluator (admin verdict → ODPC finalize)

### Summary

- **Bolt tests**: 6/6 passed (`src/service/evaluator-review.verdict.integration.test.ts`)
- **Full project suite**: 101 pass, 1 fail — the single failure is the **pre-existing**,
  unrelated `score.integration.test.ts` NaN fixture (present before this work).
- **Typecheck**: `bunx tsc --noEmit` — **0 errors** in bolt-012 files (admin verdict route + test).
- **Lint**: `biome check` clean (1 warning on `Bun.env.DATABASE_URL!`, matching existing tests).

Tests derived from story `003-admin-verdict-endpoint` ACs. The BullMQ enqueue is intercepted
with `spyOn(emailQueue, "add")` so no real jobs hit Redis and email parity is asserted.

### Acceptance Criteria Validation — Story 003

- ✅ **approve-all (national admin) → cover `finished`** — admin `{ODPC, region:null}` drives
  the ODPC finalize branch; all answers `finished`.
- ✅ **audit = admin `accountId`** — every `answerLogs.evaluation_id` and `coverLogs.evaluator_id`
  equals the admin id (verified by DB query).
- ✅ **Grade on finalize** — finished cover returns `grade: "certificate"` (all choices "2" →
  67% overall); `verdict-result-finished` email enqueued **with** the grade.
- ✅ **any reject → cover `in_progress`, `grade: null`** — `verdict-result-in-progress` email enqueued.
- ✅ **finalize gate** — leaving an answer `in_review` → `400 "finalization blocked…"`, **no**
  cover transition written, **no** email.
- ✅ **exact ODPC parity — `finished` answer immutable to admin** → `400 "…already finalized"`.
- ✅ **duplicate `answerId` → 400**.
- ✅ **non-existent cover (admin, region null) → 404**.
- ➖ **change_score requires verdictChoice+description / reject requires description** — enforced
  at the route by `VerdictBatchSchema` (TypeBox discriminated union); covered structurally by
  the schema, not re-asserted at service level.
- ➖ **hard-reject MinIO file deletion (outside txn)** — reused verbatim from the ODPC branch
  (bolt 010); the reject test uses answers with no files (nothing to delete). The deletion code
  path is unchanged by this bolt.
- ⚠️ **FLAGGED — non-DOED → 403 / anonymous → 401 at `POST /admin/covers/:id/verdict`**: enforced
  by the shared `adminGuard`, identical to the answers route (bolt 011). Not unit-testable in
  isolation (elysia-autoload scope) — see bolt 011's report. Recommend an e2e/manual check.

### Issues Found

- None in bolt-012 scope. Pre-existing `score.integration.test.ts` NaN failure remains out of scope.

### Recommendations

- One e2e smoke covering both admin routes' 403/401 guard paths would close the flagged AC for
  the whole unit.
