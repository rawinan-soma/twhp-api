---
id: 007-admin-endpoint
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 002-score-service
implemented: true
---

# Story: 007-admin-endpoint

## User Story

**As a** DOED admin
**I want** to see scores for all factories, with optional filtering by region or province
**So that** I can monitor programme-wide performance and drill into specific areas

## Acceptance Criteria

- [ ] **Given** authenticated admin, **When** `GET /twhp/api/admins/score` (no params), **Then** returns 200 with all Score Reports for `in_review`/`finished` covers
- [ ] **Given** admin provides `?region=7`, **When** same endpoint, **Then** returns only factories in health region 7
- [ ] **Given** admin provides `?provinceId=10`, **When** same endpoint, **Then** returns only factories in province 10
- [ ] **Given** admin provides both `?region=7&provinceId=10`, **When** same endpoint, **Then** both filters applied
- [ ] **Given** unauthenticated request, **Then** returns 401

## Technical Notes

- Route file: `src/routes/admins/score/index.ts`
- Use `adminGuard`
- Calls `scoreService.getAllScores({ region?, provinceId? })`
- Mirrors the optional-filter pattern in `enrollService.getAllEnrolls(region?, provinceId?)`
- Scope to current fiscal year

## Dependencies

### Requires

- 001-score-formula, 002-category-breakdown, 003-cover-status-guard, 008-score-report-shape

### Enables

- None (terminal endpoint)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| No covers match filters | Return empty array |
| Invalid region/provinceId (not in DB) | Return empty array (no 404) |

## Out of Scope

- Pagination
- CSV/PDF export
