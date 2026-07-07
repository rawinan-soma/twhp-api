---
intent: 010-change-score-file-deletion
phase: inception
created: 2026-07-07T00:00:00Z
---

# Units: Delete Evidence Files on `change_score`

## Project Type: backend-api

Decomposition: domain-driven. A single unit that modifies the finalize step of the existing **evaluation/review** domain (`003-evaluator-review`, `008-per-answer-verdict-save`, unit `001-evaluator-review` / `001-per-answer-verdict-save`). No frontend unit. No schema migration.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-change-score-file-deletion` | Widen `finalize`'s hard-reject file-deletion predicate to include `change_score`; verify cover-status/grade logic and both review surfaces (evaluator + admin-as-ODPC) are unaffected | FR-1 to FR-3 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Widen the finalize-time file-deletion predicate → `001-change-score-file-deletion`
- **FR-2** Cover-status and grade computation unchanged → `001-change-score-file-deletion`
- **FR-3** Both review surfaces stay in parity → `001-change-score-file-deletion`

## Dependency Graph

    001-change-score-file-deletion
      ├── modifies: 008-per-answer-verdict-save / 001-per-answer-verdict-save (evaluator-review.ts finalize())
      ├── reuses: answers/answerLogs/coverLogs aggregate (NO schema change)
      ├── reuses: utilities().deleteFileStrict, adminReviewerContext, resolveEvaluator
      └── supersedes: ADR-0005's file-preservation clause per ADR-0006

No schema is migrated; no other intent is modified destructively. Depends on `008-per-answer-verdict-save` being construction-complete (it is — bolts 019-021 shipped).

## Why one unit

The predicate change and its regression checks (cover-status, grade, both surfaces) all live in the single `finalize` function and its existing test suite. There's no independent deployable boundary to split — one unit, one bolt.
