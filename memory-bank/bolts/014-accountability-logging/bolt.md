---
id: 014-accountability-logging
unit: 002-accountability-logging
intent: 005-network-and-audit-logging
type: ddd-construction-bolt
status: planned
stories:
  - 001-audit-logs-table-and-service
created: 2026-06-22T00:00:00Z

requires_bolts: []
enables_bolts: [015-accountability-logging, 016-log-retention]
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 014-accountability-logging

## Overview

The audit foundation: the append-only `audit_logs` table and a `createAuditService(db)` +
singleton `auditService.record(...)` helper with actor attribution and secret hygiene. No
instrumentation yet — just the table + the one entry point everything else will call.

## Objective

Provide a single, attributed, append-only write path for accountability events, ready to be
called from domain mutators (bolt 015) and the auth flow (bolt 015).

## Stories Included

- [ ] **001-audit-logs-table-and-service**: `audit_logs` table + `auditService.record()` + attribution - Must

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: audit row = (account_id|null, actor_role, action, entity_type/id, metadata jsonb, outcome, ip, request_id, created_at); invariants: append-only, no-FK account, no secrets
- [ ] **2. design**: `createAuditService(db)` + singleton; `record(...)` signature accepting an optional txn handle; typed `action` constants + `text` column (no pgEnum)
- [ ] **3. implement**: add table to `src/drizzle/schema.ts` (`db:push`); create `src/service/audit.ts`; insert-only API
- [ ] **4. test**: row inserted with all fields; auth → account_id/role set; pre-auth → NULL; no update/delete method exists; no secret stored in metadata

## Dependencies

### Requires
- None

### Enables
- 015-accountability-logging (uses the helper)
- 016-log-retention (purges `audit_logs`)

## Success Criteria

- [ ] `auditService.record()` writes a correct, attributed, append-only row
- [ ] Helper can write inside a caller's transaction (for bolt 015) without blocking it
- [ ] No secrets; no update/delete path

## Notes

- `action` stays free-text (typed constants in code) per the open taxonomy question; revisit
  pgEnum later if desired.
