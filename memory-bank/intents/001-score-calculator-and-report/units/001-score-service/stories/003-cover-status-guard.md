---
id: 003-cover-status-guard
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 001-score-service
implemented: true
---

# Story: 003-cover-status-guard

## User Story

**As a** system
**I want** to reject score requests for covers that are still `in_progress`
**So that** partial/incomplete assessment data is never presented as a meaningful score

## Acceptance Criteria

- [ ] **Given** a factory's cover has latest CoverLog status `in_progress`, **When** score endpoint called, **Then** returns HTTP 400 with `{ message: "cover is not ready for scoring" }`
- [ ] **Given** a factory's cover has latest CoverLog status `in_review`, **When** score endpoint called, **Then** returns HTTP 200 with Score Report
- [ ] **Given** a factory's cover has latest CoverLog status `finished`, **When** score endpoint called, **Then** returns HTTP 200 with Score Report
- [ ] **Given** no cover exists for the factory's current fiscal year, **When** score endpoint called, **Then** returns HTTP 404 with `{ message: "cover not found" }`

## Technical Notes

- Derive cover status from latest `coverLogs` row (same pattern as `coverService.getCoverById`)
- Status check applies inside the service, before score calculation
- Use `utilities().getFiscalYear()` to scope to current fiscal year

## Dependencies

### Requires

- None (reads from existing CoverLogs)

### Enables

- 004-factory-endpoint through 007-admin-endpoint (guard runs inside each service method)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Factory has no enroll this fiscal year | 404 cover not found |
| Factory has enroll but no cover created | 404 cover not found |
| Cover exists but no CoverLog (shouldn't happen) | Treat as in_progress → 400 |

## Out of Scope

- Modifying cover status
- Notifying factory of rejection
