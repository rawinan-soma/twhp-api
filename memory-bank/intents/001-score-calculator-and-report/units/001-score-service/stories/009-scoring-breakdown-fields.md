---
id: 009-scoring-breakdown-fields
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-12T00:00:00.000Z
assigned_bolt: 005-score-service
implemented: true
---

# Story: 009-scoring-breakdown-fields

## User Story

**As a** consumer of the score endpoints (factory dashboard, evaluator/officer/admin tables)
**I want** each score group to report how many questions counted, the max achievable, the raw achieved points, and the percentage
**So that** I can show "120 / 150 (80%)" and know that `n/a` answers were excluded from the basis

## Acceptance Criteria

- [ ] **Given** a cover ready for scoring, **When** any score endpoint is called, **Then** the response replaces the flat score fields with a `scoring` object keyed by `total`, `collaborate`, `disease`, `safety`, `mental`, `outcome`.
- [ ] **Given** each group, **Then** it contains `scoredCount`, `maxScore`, `achievedScore`, `percentage` (all integers).
- [ ] **Given** a group with `K` non-`n/a` answers summing to `P` points, **Then** `scoredCount = K`, `maxScore = 3 × K`, `achievedScore = P`, `percentage = round(P / (3K) × 100)`.
- [ ] **Given** a group with zero non-`n/a` answers, **Then** `scoredCount = 0`, `maxScore = 0`, `achievedScore = 0`, `percentage = 0` (no divide-by-zero).
- [ ] **Given** the legacy shape, **Then** top-level `totalScore`/`collaborate`/`disease`/`safety`/`mental`/`outcome` are **removed** (breaking).
- [ ] **Given** the factory endpoint, **Then** the single object carries `scoring`; **Given** list endpoints, **Then** every array item carries `scoring`.

## Technical Notes

- Extend `calculateBreakdown` / `scoreGroup` in `src/service/scoreHelpers.ts` to return `{ scoredCount, maxScore, achievedScore, percentage }` per group instead of a bare percentage. `scoredCount` = `valid.length` (already computed), `achievedScore` = `sum` (already computed), `maxScore = 3 × valid.length`, `percentage` = current rounded value.
- Update `buildScoreReports` and `getScoreByFactory` in `src/service/score.ts` to spread the new nested `scoring` object instead of the flat fields.
- Rewrite `ScoreReportSchema` in `src/schema/score.ts`: drop the six flat integer fields, add `scoring: t.Object({ total: GroupSchema, collaborate: GroupSchema, ... })` where `GroupSchema = t.Object({ scoredCount: t.Integer({minimum:0}), maxScore: t.Integer({minimum:0}), achievedScore: t.Integer({minimum:0}), percentage: t.Integer({minimum:0, maximum:100}) })`.
- No DB change — still on-demand (ADR 0001 holds).

## Dependencies

### Requires

- 001-score-formula, 002-category-breakdown (extends their helper output)
- 008-score-report-shape (rewrites the schema it defined)

### Enables

- Consumer/frontend migration to the nested shape

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| All answers in a group are `n/a` | `{ scoredCount: 0, maxScore: 0, achievedScore: 0, percentage: 0 }` |
| All answers score `3` | `achievedScore === maxScore`, `percentage === 100` |
| Rounding (e.g. 79.6%) | `percentage` rounds half-up to nearest integer (existing `Math.round` behavior) |
| `coverStatus = in_progress` | Unchanged — still 400 (FR-3 guard untouched) |

## Out of Scope

- Returning floats for `percentage` (stays rounded integer — prior decision)
- Re-introducing the flat fields for backward compatibility (explicitly rejected — breaking change accepted)
- Frontend migration itself (tracked as a consumer task, not in this unit)
