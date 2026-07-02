---
id: 001-network-logs-table
unit: 001-network-logging
intent: 005-network-and-audit-logging
status: draft
priority: must
created: 2026-06-22T00:00:00Z
assigned_bolt: 013-network-logging
implemented: false
---

# Story: 001-network-logs-table

## User Story

**As an** operator
**I want** every HTTP request persisted as a row in a `network_logs` table
**So that** I can query the API's traffic history (who hit what, with what result) directly in the DB

## Acceptance Criteria

- [ ] **Given** the schema, **When** `bun run db:push` runs, **Then** a `network_logs` table
  exists with: `id` (serial PK), `method`, `path`, `route` (nullable), `status` (int),
  `latency_ms` (int), `ip` (nullable), `user_agent` (nullable), `account_id` (nullable int,
  **no FK**), `request_id` (nullable), `created_at` (timestamp, default now)
- [ ] **Given** the table, **When** inspected, **Then** `account_id` has **no** foreign-key
  constraint (rows survive account deletion, mirroring `answerLogs.evaluation_id`)
- [ ] **Given** the table, **When** a future read intent queries it, **Then** `created_at`,
  `account_id`, and `status` are practical to filter (indexes added here or noted for the
  read intent)
- [ ] **Given** the single-file schema convention, **When** the table is added, **Then** it
  lives in `src/drizzle/schema.ts` and **no** drizzle migration file is hand-edited

## Technical Notes

- Add to `src/drizzle/schema.ts` (single-file schema); use the same `pgTable` + `serial` +
  `timestamp(... default sql\`CURRENT_TIMESTAMP\`)` idioms already in the file
  (see `coverLogs`/`answerLogs`).
- Column for `account_id`: plain `integer("account_id")`, nullable, no `.references(...)`.
- `created_at` should be indexable for the retention purge (unit 003).

## Dependencies

### Requires
- None

### Enables
- 002-network-capture-pipeline (needs the table to write to)
- 003-log-retention/001-retention-purge-job (purges this table)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Unauthenticated request | `account_id` is `NULL` |
| Missing `x-forwarded-for` | `ip` is `NULL` |
| Very long user-agent / path | Stored as `text` (no truncation error) |

## Out of Scope

- The capture logic that fills the table (story 002).
- Any read/query endpoint.
