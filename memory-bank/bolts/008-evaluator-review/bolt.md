---
id: 008-evaluator-review
unit: 001-evaluator-review
intent: 003-evaluator-review
type: ddd-construction-bolt
status: complete
stories:
  - 005-finalize-and-transition
  - 006-file-deletion-on-reject
created: 2026-06-17T00:00:00.000Z
started: 2026-06-17T03:57:48Z
completed: "2026-06-17T04:15:00Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-06-17T03:57:48Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-06-17T03:57:48Z
    artifact: ddd-02-technical-design.md
  - name: implement
    completed: 2026-06-17T04:10:00Z
    artifact: src/service/evaluator-review.ts
  - name: test
    completed: 2026-06-17T04:15:00Z
    artifact: ddd-03-test-report.md
requires_bolts:
  - 007-evaluator-review
enables_bolts:
  - 009-evaluator-review
  - 010-evaluator-review
requires_units: []
blocks: false
complexity:
  avg_complexity: 5
  avg_uncertainty: 4
  max_dependencies: 2
  testing_scope: 5
---

# Bolt: 008-evaluator-review

## Overview

The ODPC finalize engine: override of non-`finished` answers, backstop, conversion of `recommended → finished`, the whole-Cover transition (`finished`/`in_progress`), and hard-reject MinIO file deletion executed outside the transaction. This is the riskiest bolt — the core state machine.

## Objective

Implement ODPC-only finalization: validate "no `in_review`/`recommended` left", compute the Cover transition over all answers, write the single `coverLogs` row, and delete hard-rejected files before the txn.

## Stories Included

- **005-finalize-and-transition**: override/backstop/finalize + cover transition (Must)
- **006-file-deletion-on-reject**: MinIO deletion at ODPC commit, outside txn (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: Terminal-state rules; `recommended → finished` conversion; finalize validity predicate; transition table (all `finished`→`finished`, any `rejected`→`in_progress`)
- [ ] **2. design**: File-delete-then-transaction ordering; `coverLogs` write (ODPC only); immutability guard for `finished`
- [ ] **3. implement**: Extend `evaluator-review.ts` finalize path; `utilities().deleteFile`; `coverLogs` insert
- [ ] **4. test**: Override/backstop; finalize invalid with leftover `in_review`/`recommended`; correct transition; files deleted only for hard-reject and only at commit; preserved for change-score; no partial transition on MinIO failure

## Dependencies

### Requires
- 007-evaluator-review

### Enables
- 009-evaluator-review
- 010-evaluator-review

## Success Criteria

- [ ] Only ODPC writes the `coverLogs` transition
- [ ] `finished` is immutable to everyone, incl. ODPC
- [ ] Hard-reject files deleted outside the txn; change-score files preserved
- [ ] Finalize blocked unless every answer is terminal

## Notes

- File I/O strictly before the DB transaction (project pattern)
- **ODPC commit is single-shot** — always finalizing, no draft/partial-save; must resolve the whole Cover in one commit, else reject as invalid
- Grade + email are triggered by this commit but built in bolt 010
