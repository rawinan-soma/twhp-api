---
id: 003-admin-verdict-endpoint
unit: 001-admin-as-evaluator
intent: 004-admin-as-evaluator
status: complete
priority: must
created: 2026-06-19T00:00:00.000Z
assigned_bolt: 012-admin-as-evaluator
implemented: true
---

# Story: 003-admin-verdict-endpoint

## User Story

**As a** DOED admin
**I want** to submit one atomic finalizing verdict batch over any Cover, in any region
**So that** I can override, backstop, and finalize it as a national ODPC — transitioning
the Cover, computing the Grade, and notifying the factory

## Acceptance Criteria

- [ ] **Given** `POST /twhp/api/admin/covers/:coverId/verdict` with a `VerdictBatch`,
  **When** called by a DOED admin, **Then** it runs with context
  `{ accountId: Number(jwtPayload.sub), level: "ODPC", region: null }` and drives the
  **ODPC finalize branch** of `verdict()`
- [ ] **Given** an admin batch, **When** committed, **Then** ODPC outcomes apply:
  `approve` → `finished`; `change_score` → `rejected` + `verdict_choice` (files preserved);
  `reject` → `rejected` + files deleted from MinIO **at commit, outside the txn**
- [ ] **Given** an admin commit, **When** finalizing, **Then** un-overridden `recommended`
  answers are **backstopped** to `finished`, and the **finalize gate** rejects (`400
  "finalization blocked: unresolved in_review answers remain"`) any commit leaving an
  Answer `in_review`
- [ ] **Given** a successful commit, **When** the transition is written, **Then**
  `coverLogs` gets `finished` (no rejects) or `in_progress` (any reject), with
  `evaluator_id` = admin `accountId`; every `answerLogs` row's `evaluation_id` = admin
  `accountId`
- [ ] **Given** a batch entry targeting a `finished` Answer, **When** submitted, **Then**
  `400 "answer N is already finalized"` (immutable to admin too — exact ODPC parity)
- [ ] **Given** validation, **When** the batch is malformed, **Then** the existing rules
  hold: duplicate `answerId` → `400`; unknown answer in Cover → `400`; `change_score`
  needs `verdictChoice` 0–3 + `description`; `reject` needs `description` (TypeBox union)
- [ ] **Given** a `finished` transition, **When** the response returns, **Then** it
  includes the on-demand **Grade** (`calculateBreakdown` + `computeGrade`); an
  `in_progress` transition returns `grade: null`
- [ ] **Given** any admin commit, **When** it succeeds, **Then** exactly one factory email
  is enqueued — `verdict-result-finished` (with Grade) or `verdict-result-in-progress` —
  reusing the existing jobs (no new job type/template); queue failures are swallowed/logged
- [ ] **Given** a non-DOED caller, **When** they hit `/admin/covers/:coverId/verdict`,
  **Then** `adminGuard` returns `403`

## Technical Notes

- New route `src/routes/admin/covers/[coverId]/verdict/index.ts` under `adminGuard`,
  mirroring `src/routes/evaluators/covers/[coverId]/verdict/index.ts`; reuse
  `VerdictBatchSchema` (body) and the verdict response (`message`, optional nullable
  `grade`, `400/403/404`) with `GradeSchema`.
- Because `level: "ODPC"` and the context owns all 5 categories, the out-of-scope `403`
  cannot trigger for admin — but keep the shared guard intact for evaluators.
- No change to the finalize/backstop/file-deletion/Grade/email logic — story 001's seam is
  the only structural change; this story just wires the admin route to it.

## Dependencies

### Requires
- 001-reviewer-context-seam
- 002-admin-answers-endpoint

### Enables
- (intent complete)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Admin finalizes a Cover the region ODPC already finished | Targeted `finished` answers → `400 already finalized`; nothing actionable |
| Admin batch leaves an `in_review` answer | `400` finalize-gate (unchanged) |
| Admin reject lowers score / deletes files | Files deleted at commit, outside txn (reused path) |
| Two finalizers (admin + ODPC) race | Out of scope to lock; last commit wins, `finished` answers sticky |

## Out of Scope

- Any superset power (override `finished`, act without ODPC present); actor-type audit
  marker; new score endpoint.
