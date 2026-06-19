---
intent: 004-admin-as-evaluator
phase: inception
created: 2026-06-19T00:00:00Z
---

# Units: Admin-as-Evaluator (DOED acts at ODPC level)

## Project Type: backend-api
Decomposition: domain-driven. A single unit inside the existing **evaluation/review**
domain — it adds an admin entry point that reuses intent `003`'s `evaluatorReviewService`
ODPC path. No frontend unit, no schema unit (no migration). Internal sequencing handled
by the bolt plan.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-admin-as-evaluator` | National-ODPC admin entry: generalize the reviewer context (synthesize ODPC/national, region-less cover check) and expose `GET`/`POST /admin/covers/:coverId/*` under `adminGuard`, driving the existing ODPC verdict/finalize path with admin audit + Grade/email parity | FR-1 to FR-8 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Synthesized admin reviewer context → `001-admin-as-evaluator`
- **FR-2** National (cross-region) Cover access → `001-admin-as-evaluator`
- **FR-3** Admin answer-list endpoint (read) → `001-admin-as-evaluator`
- **FR-4** Admin batch-verdict endpoint (full ODPC commit) → `001-admin-as-evaluator`
- **FR-5** Exact ODPC parity — no superset → `001-admin-as-evaluator`
- **FR-6** Audit attribution (no schema change) → `001-admin-as-evaluator`
- **FR-7** Grade + verdict email parity → `001-admin-as-evaluator`
- **FR-8** Role isolation at the guard → `001-admin-as-evaluator`

## Dependency Graph

    001-admin-as-evaluator
      ├── depends on (cross-intent): 003-evaluator-review/001-evaluator-review
      │     (reuses evaluatorReviewService ODPC path, VerdictBatchSchema, GradeSchema,
      │      verdict-result-* email jobs, categoriesFor, computeGrade/calculateBreakdown)
      ├── refactors (additively): evaluator-review.ts reviewer-resolution seam
      │     (generalize to a { accountId, level, region|null } context; region null →
      │      region-less cover existence check) — evaluator behaviour unchanged
      └── reuses: adminGuard (Role.DOED), non-FK audit columns (no schema change)

The only modification to existing code is the **additive reviewer-context seam** in
`evaluator-review.ts`; the evaluator endpoints keep their exact current behaviour.

## Why one unit

The reviewer-context refactor, the two admin endpoints, and the audit/Grade/email parity
all operate on the **same** `evaluatorReviewService` ODPC path and the same
`answers`/`answerLogs`/`coverLogs` aggregate. Splitting them across units would fragment a
single shared-logic change and force a premature interface seam. The bolt plan sequences
the refactor + read path (safe foundation) ahead of the verdict/finalize path.

## Cross-intent dependency

This unit **must not be constructed before** `003-evaluator-review/001-evaluator-review`
is implemented — it has no standalone value and physically reuses that service, schema,
and email jobs.
