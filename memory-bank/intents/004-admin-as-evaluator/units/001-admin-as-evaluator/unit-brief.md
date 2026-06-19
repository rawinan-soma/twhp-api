---
unit: 001-admin-as-evaluator
intent: 004-admin-as-evaluator
phase: inception
status: complete
created: 2026-06-19T00:00:00Z
updated: 2026-06-19T00:00:00Z
---

# Unit Brief: Admin-as-Evaluator (DOED acts at ODPC level)

## Purpose

Let the **DOED admin** act as a **national ODPC** inside the existing
`003-evaluator-review` flow. Generalize the review service's reviewer resolution so it can
take a synthesized `{ accountId, level: "ODPC", region: null }` context (instead of always
resolving an `evaluators` row + region gate), then expose admin endpoints
`GET`/`POST /twhp/api/admin/covers/:coverId/*` under `adminGuard`. The admin verdict drives
the **existing** ODPC commit path (override/backstop/finalize, file deletion, transition,
Grade, verdict-result email) with the admin's `accountId` written to the existing non-FK
audit columns. The sole unit for this intent.

## Scope

### In Scope

- **Reviewer-context seam** (additive refactor of `src/service/evaluator-review.ts`):
  generalize `getAnswers`/`verdict` to consume a resolved reviewer context
  `{ accountId, level, region: number | null }`. `region: null` → skip
  `assertCoverInRegion`, use a region-less `assertCoverExists(coverId)` (still `404` if the
  Cover truly doesn't exist). Evaluator routes keep resolving via `getEvaluatorData`
  (unchanged behaviour).
- **Admin context synthesis**: the admin route supplies `{ accountId: <admin>, level:
  "ODPC", region: null }` — never hits `getEvaluatorData`, never `404 invalid evaluator`.
- **`GET /twhp/api/admin/covers/:coverId/answers`** under `adminGuard` — ODPC ownership
  (all 5 categories), no region filter, reuses `AnswerViewSchema`.
- **`POST /twhp/api/admin/covers/:coverId/verdict`** under `adminGuard` — reuses
  `VerdictBatchSchema`; drives the ODPC finalize branch exactly (approve→`finished`,
  change_score→`rejected`+choice, reject→`rejected`+file-delete; backstop; finalize gate;
  `coverLogs` transition; Grade; email).
- **Audit**: admin `accountId` → `answerLogs.evaluation_id` + `coverLogs.evaluator_id`
  (existing non-FK integers; **no schema change**).
- **Grade + email parity**: reuse `calculateBreakdown` + `computeGrade` and the
  `verdict-result-finished` / `verdict-result-in-progress` jobs.
- **Guard isolation**: `/admin/covers/*` under `adminGuard` (DOED); `/evaluators/covers/*`
  keeps `evalGuard`.

### Out of Scope

- Any schema/migration, new enum/column, or actor-type marker (PO: no admin/ODPC
  distinction in logs/email).
- Superset powers — no override of `finished`, no "act when region lacks ODPC" escape.
- Locking for the admin+ODPC two-finalizer edge (accepted; future ADR if contention).
- Frontend/UI; intent 002/003's own work.

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Synthesized admin reviewer context | Must |
| FR-2 | National (cross-region) Cover access | Must |
| FR-3 | Admin answer-list endpoint (read) | Must |
| FR-4 | Admin batch-verdict endpoint (full ODPC commit) | Must |
| FR-5 | Exact ODPC parity — no superset | Must |
| FR-6 | Audit attribution (no schema change) | Must |
| FR-7 | Grade + verdict email parity | Must |
| FR-8 | Role isolation at the guard | Must |

## Interface (how other code interacts)

- Extends `evaluatorReviewService` (factory pattern) with a reviewer-context-driven
  signature; routes pass a resolved context. Admin routes autoloaded from
  `src/routes/admin/covers/[coverId]/{answers,verdict}/index.ts` under `adminGuard`.
- Reuses `categoriesFor("ODPC")`, `utilities()` (deleteFile), the `email` queue,
  `calculateBreakdown` / `computeGrade`, and `VerdictBatchSchema` / `GradeSchema` /
  `AnswerViewSchema`.
- Admin identity = `Number(jwtPayload.sub)` (same convention as evaluator routes).

## Dependencies

- **Cross-intent (hard)**: `003-evaluator-review/001-evaluator-review` must be implemented
  first — this unit reuses its service, schema, enums, and email jobs.
- Existing model: `answers`, `answerLogs`, `coverLogs`, `covers`, `enrolls`, `adminsDoed`.
- Existing middleware: `adminGuard` (`requireRoles(Role.DOED)`).

## Key Risks

- **Reviewer-context refactor** touches the shared `evaluator-review.ts` path used by real
  evaluators — must be behaviour-preserving for the evaluator routes (region scoping +
  `getEvaluatorData` unchanged for non-null region).
- **Two-finalizer edge**: admin (national) + region ODPC can both target one Cover.
  Accepted low-risk — both single-shot; `finished` answers sticky → second commit hits the
  "already finalized"/finalize-gate guards. No locking in v1.
- **Audit ambiguity**: admin and ODPC actions are indistinguishable in logs (PO-accepted).
