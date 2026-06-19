---
id: 012-admin-as-evaluator
unit: 001-admin-as-evaluator
intent: 004-admin-as-evaluator
type: ddd-construction-bolt
status: complete
stories:
  - 003-admin-verdict-endpoint
created: 2026-06-19T00:00:00.000Z
started: 2026-06-19T02:01:44.000Z
completed: "2026-06-19T02:06:32Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-06-19T02:01:44.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-06-19T02:01:44.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-06-19T02:01:44.000Z
    artifact: none (covered by ADR-3, bolt 011)
  - name: implement
    completed: 2026-06-19T02:01:44.000Z
    artifact: src/routes/admin/covers/[coverId]/verdict/index.ts
  - name: test
    completed: 2026-06-19T02:01:44.000Z
    artifact: ddd-03-test-report.md
requires_bolts:
  - 011-admin-as-evaluator
enables_bolts: []
requires_units: []
blocks: true
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 012-admin-as-evaluator

## Overview

The finalizing path: `POST /admin/covers/:coverId/verdict` under `adminGuard`, wiring the
national-ODPC context into the **existing** ODPC commit branch (override/backstop/finalize
gate, hard-reject file deletion outside the txn, `coverLogs` transition, Grade,
verdict-result email) with the admin's `accountId` as audit.

## Objective

Expose the admin verdict endpoint (story 003) that drives `verdict()`'s ODPC branch with
exact parity — no superset powers, no schema change, audit via existing non-FK columns.

## Stories Included

- **003-admin-verdict-endpoint**: `POST /admin/covers/:coverId/verdict` → ODPC finalize (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Admin commit == ODPC commit; audit `accountId` → `evaluation_id`/`evaluator_id`; parity invariants (`finished` immutable, single-shot, finalize gate)
- [ ] **2. design**: Admin verdict route → context `{ accountId, "ODPC", null }` → `verdict()`; reuse `VerdictBatchSchema` + verdict response (`message`, nullable `grade`)
- [ ] **3. implement**: `src/routes/admin/covers/[coverId]/verdict/index.ts`; confirm no fork of finalize/Grade/email logic (only the seam from bolt 011)
- [ ] **4. test**: Three outcomes; backstop; finalize gate `400`; `finished` `400`; transition + Grade; one email per commit (finished/in-progress); audit columns carry admin id; non-DOED `403`

## Dependencies

### Requires
- 011-admin-as-evaluator

### Enables
- (intent complete)

## Success Criteria

- [ ] Admin commit produces the same `answerLogs`/`coverLogs`/Grade/email as a regional ODPC commit
- [ ] `evaluation_id` / `evaluator_id` carry the admin `accountId` (no FK error, no schema change)
- [ ] No superset behaviour; `finished` answers immutable to admin
- [ ] `adminGuard` rejects non-DOED with `403`

## Notes

- Two-finalizer (admin + ODPC) edge is accepted/unlocked in v1 — sticky `finished` answers
  + finalize gate are the safety net.
- Reuses the `verdict-result-finished` / `verdict-result-in-progress` jobs — no new job
  type or template.
