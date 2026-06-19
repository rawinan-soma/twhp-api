---
id: 011-admin-as-evaluator
unit: 001-admin-as-evaluator
intent: 004-admin-as-evaluator
type: ddd-construction-bolt
status: complete
stories:
  - 001-reviewer-context-seam
  - 002-admin-answers-endpoint
created: 2026-06-19T00:00:00.000Z
started: 2026-06-19T01:40:07.000Z
completed: "2026-06-19T01:58:56Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-06-19T01:40:07.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-06-19T01:40:07.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-06-19T01:40:07.000Z
    artifact: adr-3-admin-national-odpc-second-finalizer.md
  - name: implement
    completed: 2026-06-19T01:40:07.000Z
    artifact: src/
  - name: test
    completed: 2026-06-19T01:40:07.000Z
    artifact: ddd-03-test-report.md
requires_bolts:
  - 010-evaluator-review
enables_bolts:
  - 012-admin-as-evaluator
requires_units: []
blocks: true
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 011-admin-as-evaluator

## Overview

The safe foundation: generalize `evaluatorReviewService` to a resolved reviewer context
`{ accountId, level, region: number | null }` (region-less cover check when null), then
stand up the read-only admin endpoint `GET /admin/covers/:coverId/answers` under
`adminGuard`. Behaviour-preserving for real evaluators; opens the national-ODPC read path.

## Objective

Land the reviewer-context seam (story 001) without changing evaluator behaviour, and
expose the admin answers list (story 002) returning all 5 categories with no region filter.

## Stories Included

- **001-reviewer-context-seam**: generalize reviewer resolution + `assertCoverExists` (Must)
- **002-admin-answers-endpoint**: `GET /admin/covers/:coverId/answers` under `adminGuard` (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Reviewer context `{ accountId, level, region: number|null }`; region-null → existence-only cover check
- [ ] **2. design**: New `getAnswers`/`verdict` signatures (context-driven); `assertCoverExists`; admin route → synthesized ODPC/national context; reuse `AnswerViewSchema`
- [ ] **3. implement**: `src/service/evaluator-review.ts` (seam), `src/routes/admin/covers/[coverId]/answers/index.ts`; evaluator routes pass `getEvaluatorData` result as context
- [ ] **4. test**: Evaluator routes unchanged (region gate + statuses); admin sees all categories cross-region; cover `404`; non-DOED `403`

## Dependencies

### Requires
- 010-evaluator-review (intent 003 fully implemented — service/schema/email reused)

### Enables
- 012-admin-as-evaluator

## Success Criteria

- [ ] Evaluator `/evaluators/covers/*` behaviour byte-for-byte unchanged
- [ ] Admin `GET /admin/covers/:coverId/answers` returns all 5 categories, any region
- [ ] `adminGuard` rejects non-DOED with `403`
- [ ] No schema change

## Notes

- This bolt is the only one that touches shared `evaluator-review.ts` resolution — keep it
  strictly behaviour-preserving for evaluators.
- Defer the admin verdict/finalize path to bolt 012.
