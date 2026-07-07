---
id: 023-change-score-file-deletion
unit: 001-change-score-file-deletion
intent: 010-change-score-file-deletion
type: ddd-construction-bolt
status: complete
stories:
  - 001-widen-finalize-file-deletion
  - 002-regression-coverstatus-and-surface-parity
created: 2026-07-07T00:00:00.000Z
started: 2026-07-07T00:00:00.000Z
completed: "2026-07-07T04:03:27Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-07-07T00:00:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-07-07T00:00:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-07-07T00:00:00.000Z
    artifact: memory-bank/standards/decision-index.md (ADR-5 entry; full ADR at docs/adr/0006-delete-files-on-change-score.md)
  - name: implement
    completed: 2026-07-07T00:00:00.000Z
    artifact: src/service/evaluator-review.ts
requires_bolts: []
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 023-change-score-file-deletion

## Overview

Widen `evaluatorReviewService.finalize`'s evidence-file deletion predicate so `change_score` verdicts delete files exactly like hard rejects, reversing ADR-0005's file-preservation clause per ADR-0006.

## Objective

Change the `hardRejectIds` filter in `finalize` (`src/service/evaluator-review.ts`) from `status === "rejected" && verdictChoice === null` to `status === "rejected"`, rename the variable/comments accordingly, and prove via regression tests that `coverStatus`/grade/email behavior and surface parity (evaluator + admin-as-ODPC) are unaffected.

## Stories Included

- **001-widen-finalize-file-deletion**: Widen finalize's file-deletion predicate to include change_score (Must)
- **002-regression-coverstatus-and-surface-parity**: Verify cover-status/grade and both surfaces are unaffected (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Pending → ddd-01-domain-model.md
- [ ] **2. design**: Pending → ddd-02-technical-design.md
- [ ] **3. implement**: Pending → `src/service/evaluator-review.ts` predicate change
- [ ] **4. test**: Pending → ddd-03-test-report.md

## Dependencies

### Requires

- None (depends on intent `008-per-answer-verdict-save` being construction-complete — it is, bolts 019-021 shipped)

### Enables

- None (terminal bolt for this domain area)

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] `evaluator-review.*.integration.test.ts` suite updated and passing
- [ ] Code reviewed

## Notes

Small, well-understood change (single predicate + rename) but reverses a named Must-priority ADR clause — kept as its own bolt with a full DDD test-report for traceability, per intent `010-change-score-file-deletion`'s inception artifacts. See `docs/adr/0006-delete-files-on-change-score.md`.
