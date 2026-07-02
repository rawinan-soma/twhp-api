---
id: 020-per-answer-verdict-save
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
type: ddd-construction-bolt
status: planned
stories:
  - 004-odpc-finalize-action
created: 2026-07-02T00:00:00Z
requires_bolts:
  - 019-per-answer-verdict-save
enables_bolts:
  - 021-per-answer-verdict-save
requires_units: []
blocks: false
complexity:
  avg_complexity: 5
  avg_uncertainty: 3
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 020-per-answer-verdict-save

## Overview

The separate ODPC finalize engine, rebuilt to read purely from persisted `answerLogs` (no in-flight batch merge). This is the riskiest bolt — the whole-Cover state machine, deferred file deletion, transition, grade, and email.

## Objective

Implement `finalize(coverId, reviewer)` (ODPC/admin only): hard-gate on any `in_review`, convert un-overridden `recommended → finished`, delete hard-reject files before the txn, write the single `coverLogs` transition, compute Grade, and enqueue the factory email — establishing that **only finalize writes `finished`**.

## Stories Included

- [ ] **004-odpc-finalize-action**: gate + `recommended→finished` + deferred delete + transition + grade + email (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: Finalize validity predicate (no `in_review`); `recommended→finished` conversion as backstop; transition table (all `finished`→`finished`+Grade / any `rejected`→`in_progress`); "only finalize writes finished" invariant
- [ ] **2. design**: Derive whole-Cover state from persisted logs (remove `effectiveState`/`batchDecisionMap`); file-delete-then-transaction ordering; ODPC-only gate; email/grade trigger
- [ ] **3. implement**: Refactor `evaluator-review.ts:249–431` into `finalize`; reuse `utilities().deleteFile`, `calculateBreakdown`/`computeGrade`, `emailQueue`
- [ ] **4. test**: tier-1 finalize `403`; hard-gate leftover `in_review` `400`; `recommended→finished` (incl. ODPC's own approvals); transition correctness; files deleted only for final hard-rejects and only at finalize; email on both outcomes; no partial transition on MinIO failure

## Dependencies

### Requires
- 019-per-answer-verdict-save

### Enables
- 021-per-answer-verdict-save

## Success Criteria

- [ ] Only `finalize` writes `finished` and the `coverLogs` transition
- [ ] End-state per Cover identical to the old batch model
- [ ] Hard-reject files deleted outside the txn; change-score/overridden files preserved
- [ ] Finalize blocked unless no Answer is `in_review`

## Notes

- File I/O strictly before the DB transaction (project pattern).
- No `effectiveState` batch merge — source of truth is entirely the persisted `answerLogs`.
- Grade/email **content** and templates are unchanged from `003` (bolt 010).
