---
id: 013-network-logging
unit: 001-network-logging
intent: 005-network-and-audit-logging
type: ddd-construction-bolt
status: planned
stories:
  - 001-network-logs-table
  - 002-network-capture-pipeline
created: 2026-06-22T00:00:00Z

requires_bolts: []
enables_bolts: [016-log-retention]
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 013-network-logging

## Overview

Stand up the network/access log: the `network_logs` table plus a **non-blocking** capture
hook in the global Elysia lifecycle (beside the existing `elysia-logger` plugin), writing one
row per request — health excluded, all statuses included, secret-safe, fire-and-forget.

## Objective

Persist API traffic to `network_logs` without adding response-path latency or ever turning a
2xx into a 5xx because of a log-write failure.

## Stories Included

- [ ] **001-network-logs-table**: `network_logs` Drizzle table (no-FK `account_id`) - Must
- [ ] **002-network-capture-pipeline**: per-request fire-and-forget capture in `src/index.ts` - Must

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: row = (method, path, route, status, latency, ip, ua, account_id|null, request_id, created_at); invariants: health excluded, all statuses, no secrets, no-FK account
- [ ] **2. design**: where to hook (start time in `onRequest`, write in `onAfterResponse`); fire-and-forget insert; `account_id` from `Number(jwtPayload.sub)`; reuse logger serializer fields
- [ ] **3. implement**: add table to `src/drizzle/schema.ts` (`db:push`); add capture beside `logger()` in `src/index.ts`; swallow-and-log insert failures
- [ ] **4. test**: row written for 2xx/4xx/5xx; health excluded; unauth → `account_id NULL`; insert failure doesn't alter response; no `Authorization` value stored; stdout logging intact

## Dependencies

### Requires
- None

### Enables
- 016-log-retention (purges `network_logs`)

## Success Criteria

- [ ] One `network_logs` row per non-health request, with accurate status + latency
- [ ] Logging never changes the HTTP response or its timing meaningfully (fire-and-forget)
- [ ] No secrets persisted; existing stdout logging unchanged

## Notes

- Table grows unbounded until bolt 016 lands retention; acceptable during construction.
