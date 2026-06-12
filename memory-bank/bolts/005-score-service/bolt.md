---
id: 005-score-service
unit: 001-score-service
intent: 001-score-calculator-and-report
type: ddd-construction-bolt
status: complete
stories:
  - 009-scoring-breakdown-fields
created: 2026-06-12T00:00:00.000Z
started: 2026-06-12T10:00:00.000Z
completed: "2026-06-12T08:05:36Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-06-12T10:20:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-06-12T10:35:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-06-12T10:36:00.000Z
    artifact: none
  - name: implement
    completed: 2026-06-12T11:00:00.000Z
    artifact: src/service/scoreHelpers.ts, src/service/score.ts, src/schema/score.ts
requires_bolts:
  - 001-score-service
  - 002-score-service
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 005-score-service

## Overview

Restructure the Score Report response (FR-9): replace the six flat percentage fields with a nested `scoring` object where every group (`total` + 5 categories) reports `scoredCount`, `maxScore`, `achievedScore`, and `percentage`. `n/a` answers are excluded from the count/max/achieved basis. This is a breaking response change across all four score endpoints.

## Objective

Ship the nested `scoring` shape end-to-end — helper, service assembly, and TypeBox schema — and migrate the existing score tests, with no DB change.

## Stories Included

- **009-scoring-breakdown-fields**: nested `scoring` object with count/max/achieved/percentage per group (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Confirm the `scoring` group shape and the formula mapping (scoredCount=valid count, maxScore=3×count, achievedScore=sum, percentage=round)
- [ ] **2. design**: `calculateBreakdown`/`scoreGroup` return type change in `scoreHelpers.ts`; `score.ts` assembly; rewritten `ScoreReportSchema` in `src/schema/score.ts`
- [ ] **3. implement**: Update `scoreHelpers.ts`, `score.ts` (`buildScoreReports` + `getScoreByFactory`), `src/schema/score.ts`
- [ ] **4. test**: Rewrite `score.test.ts` + `score.integration.test.ts` for the nested shape; assert formula invariants and the all-`n/a` zero case

## Dependencies

### Requires

- **001-score-service** (provides `scoreGroup`/`calculateBreakdown` + `scoreService`)
- **002-score-service** (the four endpoints whose response shape changes)

### Enables

- None (terminal — consumer/frontend migration is tracked outside this unit)

## Success Criteria

- [ ] All four endpoints return the nested `scoring` object and no flat score fields
- [ ] `maxScore === 3 × scoredCount` and `percentage === round(achievedScore / maxScore × 100)` for every group
- [ ] All-`n/a` group returns `{0,0,0,0}` with no divide-by-zero
- [ ] `scoring.total.percentage` matches the value the old `totalScore` produced (formula unchanged)
- [ ] Existing score tests rewritten and green
- [ ] FR-3 in_progress→400 guard still holds (untouched)

## Notes

- Pure response-shape change — no Drizzle/schema migration (ADR 0001 still holds)
- Breaking change: the frontend and any API consumer must migrate to `scoring.*.percentage`; flag in release notes
- Keep `percentage` a rounded integer (prior decision) — only the field's location changes
