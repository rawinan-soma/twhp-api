---
id: 001-score-service
unit: 001-score-service
intent: 001-score-calculator-and-report
type: ddd-construction-bolt
status: complete
stories:
  - 001-score-formula
  - 002-category-breakdown
  - 003-cover-status-guard
  - 008-score-report-shape
created: 2026-06-03T00:00:00.000Z
started: 2026-06-03T00:00:00.000Z
completed: "2026-06-03T14:38:05Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-06-03T00:00:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-06-03T00:00:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-06-03T00:00:00.000Z
    artifact: none
  - name: implement
    completed: 2026-06-03T00:00:00.000Z
    artifact: src/service/score.ts, src/schema/score.ts
  - name: test
    completed: 2026-06-03T00:00:00.000Z
    artifact: ddd-03-test-report.md
requires_bolts: []
enables_bolts:
  - 002-score-service
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 001-score-service

## Overview

Build the core score calculation service: formula implementation, per-category breakdown, cover status guard, and TypeBox response schema. This bolt has no external dependencies — it is foundational for the endpoint bolt.

## Objective

Deliver a `createScoreService(db)` factory with working score logic and a `ScoreReportSchema` TypeBox definition that all route endpoints will consume.

## Stories Included

- **001-score-formula**: Implement score calculation formula (Must)
- **002-category-breakdown**: Per-category score breakdown (Must)
- **003-cover-status-guard**: Reject in_progress covers (Must)
- **008-score-report-shape**: Score report TypeBox schema (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Domain model — ScoreReport entity, choice-to-points map, category grouping logic
- [ ] **2. design**: Technical design — service interface, DB query strategy (JOIN answers+questions+covers+enrolls+factories+provinces)
- [ ] **3. implement**: `src/service/score.ts` + `src/schema/score.ts`
- [ ] **4. test**: Verify formula correctness, category grouping, guard logic

## Dependencies

### Requires

- None (first bolt in this intent)

### Enables

- 002-score-service (endpoint bolt waits on this service)

## Success Criteria

- [ ] `calculateScore(answers, questions)` returns correct rounded integer
- [ ] All 5 category scores present and individually correct
- [ ] `in_progress` cover triggers 400 response
- [ ] `ScoreReportSchema` TypeBox type validates correctly

## Notes

- `src/service/score.ts` follows the `createXxxService(db)` factory pattern
- Query must JOIN: answers → questions (for category), covers → coverLogs (for status), enrolls → factories → provinces (for factory name + IDs)
- Fiscal year scoping via `utilities().getFiscalYear()`
