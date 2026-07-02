---
id: 015-accountability-logging
unit: 002-accountability-logging
intent: 005-network-and-audit-logging
type: ddd-construction-bolt
status: planned
stories:
  - 002-domain-action-audit
  - 003-auth-event-audit
created: 2026-06-22T00:00:00Z

requires_bolts: [014-accountability-logging]
enables_bolts: []
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 015-accountability-logging

## Overview

Instrumentation: call `auditService.record(...)` at every state-changing **domain** mutation
and every **auth/authz** event. Additive only — no existing endpoint changes its behaviour,
response shape, or failure semantics. The `coverLogs`/`answerLogs` status-history writes stay.

## Objective

Make the accountability trail real by emitting attributed rows from the domain services and
the auth flow, without regressing any existing behaviour.

## Stories Included

- [ ] **002-domain-action-audit**: instrument covers/answers/verdicts/enroll/score mutations - Must
- [ ] **003-auth-event-audit**: instrument login(±fail)/logout/refresh/2FA/role-change - Must

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: enumerate every mutating action + auth event → `action` constant, entity, metadata; rule: GETs not audited; audit write never breaks the operation
- [ ] **2. design**: insertion points in `answer.ts`, `evaluator-review.ts`, enroll/cover/score services (in-txn where applicable); auth points in `authentication.ts`, `middleware/jwt.ts`, `middleware/rbac.ts`, 2FA flow
- [ ] **3. implement**: additive `auditService.record(...)` calls; pass txn handle where present; keep `coverLogs`/`answerLogs` writes; no response/behaviour change
- [ ] **4. test**: success rows for each domain action with from→to/ids; failed login → failure row, account_id NULL, no password; GETs produce no audit row; existing endpoints unchanged; audit-insert failure never aborts the domain op

## Dependencies

### Requires
- 014-accountability-logging (the table + `auditService.record`)

### Enables
- None

## Success Criteria

- [ ] Each state-changing domain action and auth event yields exactly one meaningful audit row
- [ ] Read-only operations are not audited; `coverLogs`/`answerLogs` still written
- [ ] Zero behavioural regression in instrumented services; no secrets in metadata

## Notes

- Breadth-heavy: the design stage must produce the full action inventory so no mutator is missed.
- 2FA events are best-effort if intent 002 isn't implemented yet; login/logout/refresh are not.
