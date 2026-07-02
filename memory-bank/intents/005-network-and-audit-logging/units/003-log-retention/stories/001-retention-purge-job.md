---
id: 001-retention-purge-job
unit: 003-log-retention
intent: 005-network-and-audit-logging
status: draft
priority: must
created: 2026-06-22T00:00:00Z
assigned_bolt: 016-log-retention
implemented: false
---

# Story: 001-retention-purge-job

## User Story

**As an** operator
**I want** a daily job that deletes log rows older than 180 days from both tables
**So that** `network_logs` and `audit_logs` storage stays bounded without manual cleanup

## Acceptance Criteria

- [ ] **Given** the worker process (`bun run worker`), **When** it starts, **Then** a daily
  BullMQ **repeatable** job is registered (mirroring `src/workers.ts:5-14`,
  `repeat: { pattern: "<cron>" }`)
- [ ] **Given** the job runs, **When** it executes, **Then** it deletes rows from **both**
  `network_logs` **and** `audit_logs` where `created_at` is older than the retention window
- [ ] **Given** configuration, **When** the app/worker starts, **Then** the retention window
  is read from an env var validated in `src/config.ts` (default **180** days) — not via
  `Bun.env` directly elsewhere
- [ ] **Given** a single shared window, **When** applied, **Then** the same number of days
  governs both tables
- [ ] **Given** a purge failure, **When** it errors, **Then** it is logged and retried per the
  existing job options (`removeOnFail`, etc.) and **never** affects the API process
- [ ] **Given** the job runs in the worker, **When** registered, **Then** it does **not** run
  inside the API process

## Technical Notes

- Follow the existing BullMQ shape: a queue (e.g. `src/queue/log-retention.ts`), a worker
  (`src/worker/log-retention.ts`), and registration in `src/workers.ts` with a `jobId`,
  `repeat.pattern`, `removeOnComplete`, `removeOnFail`.
- Compute the cutoff from `getFiscalYear`-style discipline is **not** needed — this is a
  rolling 180-day window from "now"; use a timestamp cutoff (`now - retentionDays`).
- Deletes should use the indexed `created_at`; consider batched deletes for large
  `network_logs` to avoid long locks.
- Pick a daily time consistent with the existing 8:30 AM Bangkok job (a different minute/hour
  is fine; document it).

## Dependencies

### Requires
- 001-network-logging/001-network-logs-table (the `network_logs` table)
- 002-accountability-logging/001-audit-logs-table-and-service (the `audit_logs` table)

### Enables
- None (intent complete)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Huge `network_logs` backlog on first run | Batched/efficient delete; no table lock-up |
| Redis/worker down | Job simply doesn't run that cycle; retries next schedule; API unaffected |
| Retention env var missing/invalid | `src/config.ts` validation fails fast at startup (consistent with other env vars), or applies the documented default |

## Out of Scope

- Per-table / differing windows; archiving before delete; partitioning.
- Any read API.
