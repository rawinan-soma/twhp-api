---
id: 010-evaluator-review
unit: 001-evaluator-review
intent: 003-evaluator-review
type: ddd-construction-bolt
status: complete
stories:
  - 009-grade-and-live-choice
  - 010-verdict-email
created: 2026-06-17T00:00:00.000Z
started: 2026-06-17T04:45:00Z
completed: 2026-06-17T05:10:00Z
current_stage: test
stages_completed:
  - domain-model
  - technical-design
  - implement
  - test
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

# Bolt: 010-evaluator-review

## Overview

The finalize side-effects: live-choice scoring + the 4-tier Grade exposed in the finalize response and the Score Report (+ list endpoints), and the factory email queued on every ODPC commit (`finished` "complete + Grade" / `in_progress` "revision needed").

## Objective

Extend `scoreService` with a `liveChoice` resolver feeding the score formula and the top-down grade gates, add `grade` to the Score Report + list endpoints, and add the BullMQ `verdict-result` job + two Thai templates enqueued from the finalize path.

## Stories Included

- **009-grade-and-live-choice**: live-choice scoring + 4-tier grade + Score Report field (Must)
- **010-verdict-email**: verdict-result email on every ODPC commit (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: `liveChoice(answer)` rule; grade predicate ladder (top-down floors); email trigger matrix (only ODPC commit)
- [ ] **2. design**: `scoreService` extension; Score Report DTO `grade`; new `email` job type + discriminator; enqueue-after-commit
- [ ] **3. implement**: `src/service/score*.ts` (or score service), Score Report schema, `src/queue/email.ts`, `src/worker/email.ts`, two Thai templates
- [ ] **4. test**: Grade gates incl. cliff + boundaries; `grade` null unless finished; email on both ODPC outcomes; no email for tier-1/re-submit; null `enrolls.email` skip

## Dependencies

### Requires
- 008-evaluator-review (finalize commit triggers both)
- (uses 009-evaluator-review for the full loop)

### Enables
- (none — terminal)

## Success Criteria

- [ ] Score/Grade computed from live (verdict-adjusted) choices
- [ ] Grade in finalize response + Score Report + list endpoints (null unless finished)
- [ ] One email per ODPC commit; none for tier-1 or factory re-submit

## Notes

- ADR-0001 holds — no new score endpoint, extend existing
- Email worker is login-critical (ADR-0002) — keep retry/backoff
