---
id: 004-factory-endpoint
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 002-score-service
implemented: true
---

# Story: 004-factory-endpoint

## User Story

**As a** factory user
**I want** to retrieve my own assessment score after submitting
**So that** I can see how I performed overall and by category

## Acceptance Criteria

- [ ] **Given** authenticated factory with `in_review` cover, **When** `GET /twhp/api/factories/assessments/score`, **Then** returns 200 with single Score Report
- [ ] **Given** authenticated factory with `in_progress` cover, **When** same request, **Then** returns 400
- [ ] **Given** authenticated factory with no cover, **When** same request, **Then** returns 404
- [ ] **Given** unauthenticated request, **When** same endpoint, **Then** returns 401

## Technical Notes

- Route file: `src/routes/factories/assessments/score.ts` (or added to existing `index.ts` in `assessments/`)
- Use `factoryGuard`
- `factoryId` from `jwtPayload.sub`
- Calls `scoreService.getScoreByFactory(factoryId)`

## Dependencies

### Requires

- 001-score-formula, 002-category-breakdown, 003-cover-status-guard, 008-score-report-shape

### Enables

- None (terminal endpoint)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Factory with no enroll | 404 |
| Cover in_progress | 400 |

## Out of Scope

- Historical scores from past fiscal years
- Score for another factory
