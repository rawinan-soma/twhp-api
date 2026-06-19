---
stage: design
bolt: 012-admin-as-evaluator
created: 2026-06-19T02:01:44Z
---

## Technical Design: admin-as-evaluator (admin verdict → ODPC finalize)

### Architecture Pattern

Same parameterization seam as bolt 011. The `verdict()` service method already accepts a
`ReviewerContext`; this bolt adds **one route file** that builds the admin context and calls
it. Zero new business logic — the ODPC finalize/backstop/file-delete/transition/Grade/email
path is reused verbatim. Rationale: keeps a single finalize implementation (ADR-0003/0004),
satisfies "no copy-paste" (unit brief), and makes admin parity structural rather than
re-implemented.

### Layer Structure

```text
Presentation:  POST /admin/covers/:coverId/verdict   (adminGuard)   [NEW]
                 → adminReviewerContext(sub) → evaluatorReviewService.verdict(coverId, ctx, body)
Application/Domain:  verdict(coverId, reviewer, batch)   (existing, generalized in bolt 011)
                       → ODPC branch: validate → backstop → finalize gate → file delete
                         (outside txn) → txn(answerLogs + coverLogs) → Grade → email
Infrastructure:  Drizzle (answerLogs/answers/coverLogs), MinIO (deleteFile), BullMQ (emailQueue)
```

### API Design

- **`POST /twhp/api/admin/covers/:coverId/verdict`** [NEW] — guard `adminGuard` (DOED).
  - Request: path `coverId: number`; body `VerdictBatchSchema` (reused).
  - Handler:
    `const reviewer = adminReviewerContext(Number(jwtPayload.sub)); return evaluatorReviewService.verdict(coverId, reviewer, body);`
  - Response `200`: `{ message: string, grade?: GradeSchema | null }` (reused from the
    evaluator verdict route). `400` (validation / finalize-gate / already-finalized),
    `403` (guard), `404` (cover not found).
  - OpenAPI tag: `["admin"]`.

Mirrors `src/routes/evaluators/covers/[coverId]/verdict/index.ts` exactly, swapping
`evalGuard` + `resolveEvaluator` for `adminGuard` + `adminReviewerContext` (no
`ElysiaCustomStatusResponse` early-return needed — the admin context is built synchronously).

### Behaviour (all reused from the ODPC branch)

- approve → `finished`; change_score → `rejected` + `verdict_choice` (files kept);
  reject → `rejected` + files deleted at commit (outside txn).
- Backstop un-overridden `recommended` → `finished`; finalize gate rejects a commit leaving
  any `in_review` (`400 "finalization blocked: unresolved in_review answers remain"`).
- `finished` answer in batch → `400 "answer N is already finalized"` (immutable to admin).
- Duplicate `answerId` → `400`; unknown answer in cover → `400`.
- Out-of-scope guard cannot trigger (admin owns all 5 categories), but remains intact for evaluators.
- Transition: any reject → `in_progress` (Grade null); else `finished` (Grade computed).
- Audit: `answerLogs.evaluation_id` + `coverLogs.evaluator_id` = admin `accountId`.
- Email: `verdict-result-finished` (with Grade) / `verdict-result-in-progress`, reused jobs.

### Data Model

No schema change. Writes use existing columns; `evaluation_id` / `evaluator_id` carry the
admin `accountId` (plain integers, no FK).

### Security Design

- `adminGuard` (`requireRoles(Role.DOED)`) → non-DOED `403`; `/evaluators/covers/*` keeps
  `evalGuard` → DOED `403`. National scope (`region: null`) only reachable via the
  admin-guarded route.

### NFR Implementation

- **Atomicity / file ordering**: inherited from the reused ODPC branch (one txn; MinIO
  deletes before the txn).
- **No divergence**: admin commit and regional-ODPC commit run identical code.

### Integration points

- `adminReviewerContext`, `evaluatorReviewService.verdict` (bolt 011), `VerdictBatchSchema`,
  `GradeSchema`, `adminGuard`. Autoload registers the new route.
