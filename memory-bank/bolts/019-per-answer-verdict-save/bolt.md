---
id: 019-per-answer-verdict-save
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
type: ddd-construction-bolt
status: complete
stories:
  - 001-verdict-schema-refactor
  - 002-save-answer-verdict-service
  - 003-authorship-edit-guard
created: 2026-07-02T00:00:00.000Z
started: 2026-07-02T07:22:43.000Z
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-07-02T07:24:41.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-07-02T07:26:53.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-07-02T07:26:53.000Z
    artifact: none (skipped — covered by ADR-0005)
requires_bolts: []
enables_bolts:
  - 020-per-answer-verdict-save
  - 021-per-answer-verdict-save
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
completed: "2026-07-02T07:41:13Z"
---

# Bolt: 019-per-answer-verdict-save

## Overview

The per-Answer write path: reshape the verdict DTOs (drop the batch), implement `saveAnswerVerdict` (one `answerLogs` row, no side effects, approve→`recommended` for all levels), and replace the blanket verdict guard with the authorship-keyed edit guard.

## Objective

Make a single verdict durable and resumable, with correct level-independent status and an `eval_id`-keyed edit guard — with no MinIO/coverLogs/email side effects.

## Stories Included

- [ ] **001-verdict-schema-refactor**: single-save body, drop `VerdictBatchSchema`, add `FinalizeSchema` (Must)
- [ ] **002-save-answer-verdict-service**: `saveAnswerVerdict` — existence/scope/no-op checks, one log, approve→recommended (Must)
- [ ] **003-authorship-edit-guard**: `finished`→none, `recommended`→author/ODPC, `rejected`/`in_review`→scoped (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: Save = one append-only verdict event; status mapping (approve→recommended all levels); edit-permission predicate keyed on latest-log status + `eval_id`
- [ ] **2. design**: `saveAnswerVerdict` signature on `createEvaluatorReviewService`; latest-log read; DTO shapes; guard ordering
- [ ] **3. implement**: Refactor `src/schema/evaluator-review.ts`; add `saveAnswerVerdict` in `src/service/evaluator-review.ts`; extract single-Answer checks from the old batch loop
- [ ] **4. test**: approve→recommended (tier-1 + ODPC); change_score/reject; no-op change_score `400`; scope `403`; guard cases (finished immutable, recommended author/ODPC-only, factory-accept protection, tier-1 edits own while in_review); zero side effects

## Dependencies

### Requires
- (none)

### Enables
- 020-per-answer-verdict-save
- 021-per-answer-verdict-save

## Success Criteria

- [ ] One `answerLogs` row per save, `eval_id` recorded
- [ ] No save path writes `finished`, touches MinIO, writes `coverLogs`, or enqueues email
- [ ] Authorship-keyed guard replaces the blanket `recommended && !ODPC → 403`

## Notes

- No `db:push` — DTO/service only; `answerStatus` and tables unchanged.
- Re-saving is the edit mechanism; there is no separate edit endpoint.
