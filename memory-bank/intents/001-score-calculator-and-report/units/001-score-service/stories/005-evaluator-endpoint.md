---
id: 005-evaluator-endpoint
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 002-score-service
implemented: true
---

# Story: 005-evaluator-endpoint

## User Story

**As an** evaluator
**I want** to see scores for all factories in my health region
**So that** I can assess regional performance at a glance

## Acceptance Criteria

- [ ] **Given** authenticated evaluator, **When** `GET /twhp/api/evaluators/score`, **Then** returns 200 with array of Score Reports for factories in evaluator's region
- [ ] **Given** no factories in region have `in_review`/`finished` covers, **When** same request, **Then** returns 200 with empty array
- [ ] **Given** unauthenticated request, **When** same endpoint, **Then** returns 401
- [ ] **Given** response array, **Then** each item contains all Score Report fields including category breakdown

## Technical Notes

- Route file: `src/routes/evaluators/score/index.ts`
- Use `evalGuard`; get evaluator region via `evaluatorService.helper.getEvaluatorData(accountId)`
- Calls `scoreService.getScoresByRegion(region)` — returns only covers with `in_review` or `finished` status
- Scope to current fiscal year

## Dependencies

### Requires

- 001-score-formula, 002-category-breakdown, 003-cover-status-guard, 008-score-report-shape

### Enables

- None (terminal endpoint)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Region has factories but all covers in_progress | Return empty array |
| Invalid evaluator account | 404 from evaluatorService helper |

## Out of Scope

- Filtering by province within region
- Sorting/ordering results
