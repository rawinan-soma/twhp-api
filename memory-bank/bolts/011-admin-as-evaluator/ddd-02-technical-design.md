---
stage: design
bolt: 011-admin-as-evaluator
created: 2026-06-19T01:40:07Z
---

## Technical Design: admin-as-evaluator (seam + admin answers read)

### Architecture Pattern

Layer-based domain structure (existing project pattern): route → service singleton →
Drizzle. The change is a **parameterization seam**: the review service stops resolving the
reviewer internally and instead receives a `ReviewerContext`. The route layer becomes the
only place that knows *how* a caller maps to a context (evaluator lookup vs. admin
synthesis). This keeps one ODPC code path and lets a new caller type be added as a route +
context, no new business logic. Rationale: matches the "services return `status(...)`,
routes wire them" convention and the unit-brief's preferred seam.

### Layer Structure

```text
┌─────────────────────────────────────────────┐
│ Presentation                                 │
│  /evaluators/covers/:id/answers  (evalGuard) │  → resolveEvaluator(sub) → ctx
│  /evaluators/covers/:id/verdict  (evalGuard) │  → resolveEvaluator(sub) → ctx
│  /admin/covers/:id/answers       (adminGuard)│  → adminReviewerContext(sub) → ctx   [NEW]
├─────────────────────────────────────────────┤
│ Application / Domain  (evaluator-review.ts)  │
│  resolveEvaluator / adminReviewerContext     │  reviewer resolution (seam)
│  getAnswers(coverId, reviewer)               │  generalized
│  verdict(coverId, reviewer, batch)           │  generalized (signature only this bolt)
│  helper.assertCoverInRegion / assertCoverExists
├─────────────────────────────────────────────┤
│ Infrastructure                               │
│  Drizzle (covers/answers/questions/answerLogs)
└─────────────────────────────────────────────┘
```

### API Design

- **`GET /twhp/api/admin/covers/:coverId/answers`** [NEW] — guard `adminGuard` (DOED).
  - Request: path `coverId: number`. No body.
  - Handler: `const reviewer = adminReviewerContext(Number(jwtPayload.sub)); return evaluatorReviewService.getAnswers(coverId, reviewer);`
  - Response `200`: `AnswerViewSchema` (reused verbatim). `404`: `{ message }` (cover not found).
  - `403`: enforced by `adminGuard` for non-DOED (no explicit response branch needed).
  - OpenAPI tag: `["admin"]`.
- **`GET /twhp/api/evaluators/covers/:coverId/answers`** [MODIFIED] — same external contract;
  handler now resolves a context first:
  `const reviewer = await evaluatorReviewService.resolveEvaluator(Number(jwtPayload.sub)); if (reviewer instanceof ElysiaCustomStatusResponse) return reviewer; return evaluatorReviewService.getAnswers(coverId, reviewer);`
- **`POST /twhp/api/evaluators/covers/:coverId/verdict`** [MODIFIED] — same external contract;
  handler resolves context then calls `verdict(coverId, reviewer, body)`.
- **`POST /admin/covers/:coverId/verdict`** — **NOT in this bolt** (bolt 012). The `verdict`
  signature is generalized now so 012 only adds the route.

### Service changes (`src/service/evaluator-review.ts`)

1. **Type** (exported): `ReviewerContext = { accountId: number; level: EvaluatorLevel; region: number | null }`.
   `EvaluatorLevel` exported from `evaluator.ts` (add `export`).
2. **Helper** `assertCoverExists(coverId)` added next to `assertCoverInRegion` — same shape
   minus the `provinces.health_region` filter; returns `status(404, { message: "cover not found" })`.
3. **`resolveEvaluator(callerId)`** added to the service object: wraps
   `evaluatorService.helper.getEvaluatorData`; on success returns the `ReviewerContext`,
   else returns the `ElysiaCustomStatusResponse` (404 invalid evaluator).
4. **`adminReviewerContext(accountId)`** exported pure function → `{ accountId, level: "ODPC", region: null }`.
5. **`getAnswers(coverId, reviewer)`**: drop the internal `getEvaluatorData`; pick cover
   check by `reviewer.region === null`; use `categoriesFor(reviewer.level)`. Body otherwise
   identical.
6. **`verdict(coverId, reviewer, batch)`**: destructure `{ accountId, level, region } = reviewer`;
   pick cover check by `region === null`; replace `evaluator.accountId` → `accountId`
   throughout (`eval_id`, backstop `eval_id`, `coverLogs.evaluatorId`). Body otherwise
   identical — **no change to finalize/backstop/file-delete/grade/email logic**.

### Data Model

No schema change. New read query: `select covers.id from covers where covers.id = :coverId limit 1`.
Audit columns `answerLogs.evaluation_id` / `coverLogs.evaluator_id` are unchanged (used by
bolt 012's admin commit; this bolt only changes how `accountId` is sourced for the
evaluator verdict path — same value as before).

### Security Design

- **Guard isolation**: admin route under `adminGuard` (`requireRoles(Role.DOED)`) → non-DOED
  `403`; evaluator routes keep `evalGuard` → DOED `403`. No route accepts both.
- **No region escalation for evaluators**: `region` is `null` only via `adminReviewerContext`,
  which is only reachable from the `adminGuard`-protected route. An evaluator can never
  obtain a null-region context.
- Caller identity from `jwtPayload.sub` (same convention as evaluator routes).

### NFR Implementation

- **Behaviour preservation**: evaluator routes produce byte-identical responses (same
  resolution, same region gate, same category filter) — verified by integration tests that
  exercise the evaluator path post-refactor.
- **Code reuse**: zero duplication of the ODPC/answers logic; one `getAnswers` body.
- **Maintainability**: adding bolt 012's admin verdict = one route file + reuse of the
  already-generalized `verdict`.

### Integration points

- `evaluatorService.helper.getEvaluatorData` (reused, wrapped).
- `categoriesFor`, `EvaluatorLevel` (from `evaluator.ts`).
- `AnswerViewSchema` (from `schema/evaluator-review.ts`), `adminGuard` (from `middleware/guards.ts`).
- Autoload registers the new `src/routes/admin/covers/[coverId]/answers/index.ts`.
