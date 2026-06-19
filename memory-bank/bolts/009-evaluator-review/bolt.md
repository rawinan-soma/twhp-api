---
id: 009-evaluator-review
unit: 001-evaluator-review
intent: 003-evaluator-review
type: ddd-construction-bolt
status: complete
stories:
  - 007-factory-accept-object-redo
  - 008-resubmit-gate
created: 2026-06-17T00:00:00.000Z
started: 2026-06-17T04:15:00Z
completed: "2026-06-17T04:45:00Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-06-17T04:15:00Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-06-17T04:25:00Z
    artifact: ddd-02-technical-design.md
  - name: implement
    completed: 2026-06-17T04:40:00Z
    artifact: src/service/answer.ts, src/schema/answer.ts, src/routes/factories/assessments/index.ts
  - name: test
    completed: 2026-06-17T04:45:00Z
    artifact: ddd-03-test-report.md
requires_bolts:
  - 008-evaluator-review
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 4
  avg_uncertainty: 3
  max_dependencies: 2
  testing_scope: 4
---

# Bolt: 009-evaluator-review

## Overview

The factory side of the negotiation loop: accept (→`recommended`, same file validator), object/redo (→`in_review`, free file management), and the re-submit gate (allowed when no answer is `rejected`). Closes the loop back to ODPC finalize.

## Objective

Extend the existing factory answer/Cover endpoints with accept/object/redo semantics and the new re-submit guard, reusing the per-choice file validator and the file-I/O-outside-txn pattern.

## Stories Included

- **007-factory-accept-object-redo**: factory negotiation actions (Must)
- **008-resubmit-gate**: re-submit when no answer rejected (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: Factory action → status transitions; accept file-validation rule; sticky `recommended`/`finished`
- [ ] **2. design**: Reuse `answer.ts` validator; MinIO reconcile (delete removed, upload added) before txn; re-submit gate predicate
- [ ] **3. implement**: Extend factory answer service/routes; Cover re-submit path
- [ ] **4. test**: Accept upward w/o files rejected; object lowering deletes files; redo re-uploads; re-submit blocked while any `rejected`; locked `recommended`/`finished`

## Dependencies

### Requires
- 008-evaluator-review

### Enables
- (loop back to 008 finalize)

## Success Criteria

- [ ] Accept → `recommended`, live = verdict choice, validated
- [ ] Object/redo → `in_review` with reconciled evidence
- [ ] Re-submit only when no answer is `rejected`

## Notes

- These are factory-facing endpoints (own Cover), not under `evalGuard`
- File I/O outside the DB transaction
