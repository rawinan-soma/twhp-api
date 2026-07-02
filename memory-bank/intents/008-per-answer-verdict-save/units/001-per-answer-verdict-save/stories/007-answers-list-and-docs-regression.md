---
id: 007-answers-list-and-docs-regression
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
status: draft
priority: must
created: 2026-07-02T00:00:00Z
assigned_bolt: 021-per-answer-verdict-save
implemented: false
---

# Story: 007-answers-list-and-docs-regression

# User Story

**As** a maintainer
**I want** the answer-list read confirmed unchanged, the API docs regenerated, and the tests restructured
**So that** the two-phase model is documented and regression-safe

## Acceptance Criteria

- [ ] **Given** `GET …/covers/:coverId/answers`, **When** the refactor lands, **Then** its filtering, projection, region/category scope, and response schema are unchanged, and each Answer reports its current status (the resume source)
- [ ] **Given** the API docs, **When** regenerated, **Then** `docs/api/openapi.json`, `docs/api/API.md`, and `docs/api/index.html` reflect the new save + finalize endpoints and the removed batch endpoint
- [ ] **Given** `evaluator-review.integration.test.ts`, **When** restructured, **Then** per-Answer save cases exist (approve→recommended for tier-1 **and** ODPC; change_score; reject; no-op change_score `400`; scope `403`; authorship guard incl. finished-immutable, recommended author/ODPC-only, factory-accept protection)
- [ ] **Given** `evaluator-review.verdict.integration.test.ts`, **When** restructured, **Then** finalize cases exist (hard-gate on `in_review` `400`; `recommended→finished` incl. ODPC's own; transition finished/in_progress; deferred file deletion only for final hard-rejects; email on both outcomes; tier-1 finalize `403`)
- [ ] **Given** the removed batch, **When** tests run, **Then** the "duplicate answerId in batch" case is gone and no test references `VerdictBatchSchema`
- [ ] **Given** the full suite, **When** run, **Then** it passes

## Technical Notes

- Docs are generated from the route definitions/OpenAPI plugin — regen after routes (005/006) land.
- Keep the level→category map and region-scope assertions from the `003` tests; only the write-path shape changes.

## Dependencies

### Requires
- 005-save-and-finalize-routes
- 006-admin-surface-parity

### Enables
- (none — final story)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Resuming a partially reviewed cover | GET answers shows some Answers still `in_review` |
| Docs drift | Regen fails CI/lint if endpoints mismatch |

## Out of Scope

- Any behavior change to `getAnswers` (read is intentionally untouched).
