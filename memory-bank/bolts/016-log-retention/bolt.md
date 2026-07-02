---
id: 016-log-retention
unit: 003-log-retention
intent: 005-network-and-audit-logging
type: ddd-construction-bolt
status: planned
stories:
  - 001-retention-purge-job
created: 2026-06-22T00:00:00Z

requires_bolts: [013-network-logging, 014-accountability-logging]
enables_bolts: []
requires_units: []
blocks: false

complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 016-log-retention

## Overview

The shared retention job: a daily BullMQ repeatable job (mirroring `src/workers.ts:5-14`)
that deletes rows older than 180 days from **both** `network_logs` and `audit_logs`, with the
window configured in `src/config.ts`. Runs in the worker process only.

## Objective

Bound both log tables' growth at a configurable 180-day window without ever touching the API
process or failing it.

## Stories Included

- [ ] **001-retention-purge-job**: daily 180-day purge of both tables + env config - Must

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: rolling cutoff = now − retentionDays (default 180); deletes both tables; shared window; worker-only
- [ ] **2. design**: new queue + worker (`src/queue/log-retention.ts`, `src/worker/log-retention.ts`); register repeatable job in `src/workers.ts`; add retention-days env to `src/config.ts`; batched delete on indexed `created_at`
- [ ] **3. implement**: wire env, queue, worker, registration; delete from `network_logs` + `audit_logs`
- [ ] **4. test**: rows older than window deleted from both tables; newer rows kept; job registered as repeatable; env default 180 validated; failure logged + retried, API unaffected; job not registered in API process

## Dependencies

### Requires
- 013-network-logging (the `network_logs` table)
- 014-accountability-logging (the `audit_logs` table)

### Enables
- None (intent complete)

## Success Criteria

- [ ] Daily repeatable job purges both tables at the configured window (default 180 days)
- [ ] Purge runs in the worker, never affects the API, retries on failure
- [ ] Window is env-configurable and startup-validated

## Notes

- A different daily minute/hour than the 8:30 AM reminder job is fine; document the chosen time.
- Large first-run backlog on `network_logs` should be deleted in batches to avoid long locks.
