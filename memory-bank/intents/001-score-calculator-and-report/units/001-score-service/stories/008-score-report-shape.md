---
id: 008-score-report-shape
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 001-score-service
implemented: true
---

# Story: 008-score-report-shape

## User Story

**As a** developer building route response validation
**I want** a TypeBox schema for the Score Report shape
**So that** all four endpoints share a consistent, validated response type

## Acceptance Criteria

- [ ] **Given** a Score Report TypeBox schema, **Then** it contains fields: `factoryId` (number), `factoryNameTh` (string), `coverId` (number), `coverStatus` (string), `enrollId` (number)
- [ ] **Given** same schema, **Then** score fields are all `t.Integer()` with minimum 0 and maximum 100: `totalScore`, `collaborate`, `disease`, `safety`, `mental`, `outcome`
- [ ] **Given** a list endpoint, **Then** response type is `t.Array(ScoreReportSchema)`
- [ ] **Given** a single endpoint (factory), **Then** response type is `ScoreReportSchema` directly

## Technical Notes

- Define `ScoreReportSchema` in `src/schema/` (e.g. `src/schema/score.ts`)
- Use TypeBox `t.Object({...})` — consistent with existing `src/schema/` files
- Export both `ScoreReportSchema` (single) and `ScoreReportListSchema` (array) for reuse across 4 route files

## Dependencies

### Requires

- None (pure TypeBox definition)

### Enables

- 004-factory-endpoint through 007-admin-endpoint (all import this schema)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Score value of 0 | Valid — minimum is 0 |
| Score value of 100 | Valid — maximum is 100 |

## Out of Scope

- Drizzle select schema generation (no new DB table)
- Pagination wrapper schema
