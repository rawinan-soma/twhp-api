---
unit: 003-log-retention
intent: 005-network-and-audit-logging
phase: inception
status: draft
created: 2026-06-22T00:00:00Z
updated: 2026-06-22T00:00:00Z
---

# Unit Brief: Log Retention

## Purpose

Bound the storage growth of **both** log tables with a single scheduled maintenance job that
deletes rows older than a configurable window (**180 days**). Runs in the worker process,
not the API.

## Scope

### In Scope
- **One daily BullMQ repeatable job** mirroring the pattern in `src/workers.ts:5-14`
  (`repeat: { pattern: "<cron>" }`), deleting rows from **both** `network_logs` **and**
  `audit_logs` where `created_at` is older than the retention window.
- **Env config** in `src/config.ts`: a retention-days var (default **180**), validated at
  startup like all other env vars (not read via `Bun.env` directly elsewhere).
- A **shared window** applies to both tables (one value).
- Job registered from the worker entrypoint (`src/workers.ts`), running under `bun run worker`;
  failures logged + retried per existing job options and never affecting the API.

### Out of Scope
- Per-table / differing retention windows (one shared value this intent).
- Archiving/export before delete; partitioning.
- Any read API.

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-8 | Retention — 180-day purge for both logs | Must |

## Interface (how other code interacts)

- A new queue/worker (e.g. `src/queue/log-retention.ts` + `src/worker/log-retention.ts`)
  plus a registration in `src/workers.ts`. No API surface; no service consumed by app code.

## Dependencies

- **Within-intent (hard)**: requires the `network_logs` table (unit `001`) **and** the
  `audit_logs` table (unit `002`) to exist — the purge targets both.
- Existing: BullMQ/Redis setup (`src/queue/email.ts`, `src/worker/email.ts`,
  `src/workers.ts`), `src/config.ts`, Drizzle `db`.

## Key Risks

- **Mass delete cost**: large `network_logs` deletes should be safe (indexed `created_at`,
  optionally batched) so the purge doesn't lock the table or spike load.
- **Window correctness**: 180 days applies to the accountability trail too (PO decision) —
  audit history older than 180d is unrecoverable; revisit if compliance later requires longer.

## Story Summary

- **Total Stories**: 1
- **Must Have**: 1

### Stories

- [ ] **001-retention-purge-job**: Daily 180-day purge of both tables + env config - Must - Planned
