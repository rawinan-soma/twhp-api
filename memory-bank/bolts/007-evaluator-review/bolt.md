---
id: 007-evaluator-review
unit: 001-evaluator-review
intent: 003-evaluator-review
type: ddd-construction-bolt
status: complete
stories:
  - 003-answers-list-endpoint
  - 004-verdict-batch-endpoint
created: 2026-06-17T00:00:00.000Z
started: 2026-06-17T03:45:43.000Z
completed: "2026-06-17T03:57:48Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-06-17T03:45:43.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-06-17T03:45:43.000Z
    artifact: ddd-02-technical-design.md
  - name: implement
    completed: 2026-06-17T03:45:43.000Z
    artifact: src/
requires_bolts:
  - 006-evaluator-review
enables_bolts:
  - 008-evaluator-review
requires_units: []
blocks: false
complexity:
  avg_complexity: 4
  avg_uncertainty: 3
  max_dependencies: 2
  testing_scope: 4
---

# Bolt: 007-evaluator-review

## Overview

The evaluator read + write surface: the level-filtered answers list and the atomic verdict batch endpoint (validation, out-of-scope `403`, three outcomes, level-dependent status). This records verdicts; finalize/transition/file-deletion are the next bolt.

## Objective

Stand up `GET …/covers/:coverId/answers` (hard category filter) and `POST …/covers/:coverId/verdict` (single-transaction batch) with the `evaluatorReviewService`, recording `recommended`/`rejected` outcomes per the level rules.

## Stories Included

- **003-answers-list-endpoint**: level-filtered answers read (Must)
- **004-verdict-batch-endpoint**: atomic verdict batch + validation + `403` guard (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: Verdict batch payload, outcome→status mapping (tier-1 approve→`recommended`, change/reject→`rejected`), actionability rule
- [ ] **2. design**: `evaluatorReviewService.verdict()` + answers query signatures; TypeBox discriminated-union DTO on `decision`; scope check before txn
- [ ] **3. implement**: `src/routes/evaluators/covers/[coverId]/answers/index.ts`, `.../verdict/index.ts`, `src/service/evaluator-review.ts`, `src/schema/*`
- [ ] **4. test**: Category filter correctness; whole-batch `403`; per-outcome validation; atomic write; `eval_id` recorded

## Dependencies

### Requires
- 006-evaluator-review

### Enables
- 008-evaluator-review

## Success Criteria

- [ ] Mental/DOH/ODPC each see & act only on their categories
- [ ] Any out-of-scope entry rejects the entire batch (`403`)
- [ ] All `answerLogs` writes are one transaction; no partial save

## Notes

- Defer file deletion + cover transition to bolt 008
- Route layer mirrors existing `src/routes/evaluators/*` autoload + `evalGuard`
