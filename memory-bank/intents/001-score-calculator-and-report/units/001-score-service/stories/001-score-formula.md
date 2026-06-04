---
id: 001-score-formula
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 001-score-service
implemented: true
---

# Story: 001-score-formula

## User Story

**As a** developer building the score service
**I want** a `calculateScore` function that converts Answer choices to a rounded integer percentage
**So that** all score endpoints share a single, consistent calculation

## Acceptance Criteria

- [ ] **Given** answers with choices `["3","2","1","0"]`, **When** score calculated, **Then** returns `round((3+2+1+0) / (3×4) × 100)` = `50`
- [ ] **Given** all answers are `"n/a"`, **When** score calculated, **Then** returns `0`
- [ ] **Given** mix of `"3"` and `"n/a"`, **When** score calculated, **Then** `n/a` excluded from denominator — `round(3 / (3×1) × 100)` = `100`
- [ ] **Given** all answers are `"3"`, **When** score calculated, **Then** returns `100`
- [ ] **Given** all answers are `"0"`, **When** score calculated, **Then** returns `0`
- [ ] **Given** `special` field varies across questions, **When** score calculated, **Then** `special` has no effect on result

## Technical Notes

- Implement as a pure helper inside `createScoreService(db)` or a standalone util
- Choice-to-points map: `{ "3": 3, "2": 2, "1": 1, "0": 0, "n/a": null }`
- Formula: `Math.round(sum / (3 * nonNaCount) * 100)` — guard for `nonNaCount === 0` → return `0`
- Follow existing service factory pattern in `src/service/`

## Dependencies

### Requires

- None (pure computation, no DB needed for the formula itself)

### Enables

- 002-category-breakdown (uses same formula per category)
- 004-factory-endpoint through 007-admin-endpoint (all call score calculation)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| All answers `n/a` | Return 0 (avoid division by zero) |
| Single answer `"3"` | Return 100 |
| Mix of valid choices + some `n/a` | Exclude `n/a` from denominator |

## Out of Scope

- Persisting the calculated score
- Score history or trend
