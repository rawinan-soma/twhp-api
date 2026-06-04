---
id: 006-provincial-endpoint
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 002-score-service
implemented: true
---

# Story: 006-provincial-endpoint

## User Story

**As a** provincial officer
**I want** to see scores for all factories in my province
**So that** I can monitor factory performance at the provincial level

## Acceptance Criteria

- [ ] **Given** authenticated provincial officer, **When** `GET /twhp/api/provincialOfficers/score`, **Then** returns 200 with array of Score Reports for factories in officer's province
- [ ] **Given** no factories in province have `in_review`/`finished` covers, **When** same request, **Then** returns 200 with empty array
- [ ] **Given** unauthenticated request, **When** same endpoint, **Then** returns 401

## Technical Notes

- Route file: `src/routes/provincialOfficers/score/index.ts`
- Use `officerGuard`; derive `provinceId` from `provincialOfficerService` (or direct DB lookup of officer by `accountId`)
- Calls `scoreService.getScoresByProvince(provinceId)`
- Scope to current fiscal year

## Dependencies

### Requires

- 001-score-formula, 002-category-breakdown, 003-cover-status-guard, 008-score-report-shape

### Enables

- None (terminal endpoint)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Province has no enrolled factories | Return empty array |
| All covers in province are in_progress | Return empty array |

## Out of Scope

- Cross-province comparison
