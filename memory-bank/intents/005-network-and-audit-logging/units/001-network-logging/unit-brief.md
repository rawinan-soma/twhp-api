---
unit: 001-network-logging
intent: 005-network-and-audit-logging
phase: inception
status: draft
created: 2026-06-22T00:00:00Z
updated: 2026-06-22T00:00:00Z
---

# Unit Brief: Network Logging

## Purpose

Persist a queryable **traffic record** — one `network_logs` row per HTTP request reaching
the API — without slowing or destabilizing the request path. Captures *what hit the system*
(method, path, status, latency, ip, user-agent, authenticated account). Sits alongside the
existing `@bogeychan/elysia-logger` stdout pipeline in `src/index.ts`; does not replace it.

## Scope

### In Scope
- **`network_logs` Drizzle table** in `src/drizzle/schema.ts`: `id` (serial PK), `method`,
  `path`, `route` (matched pattern when available), `status` (int), `latency_ms` (int),
  `ip` (`x-forwarded-for`), `user_agent`, `account_id` (nullable int, **no FK**),
  `request_id` (nullable), `created_at`. Applied via `bun run db:push`.
- **Non-blocking capture pipeline** wired into the global Elysia lifecycle beside the
  current `logger()` plugin: measures latency, resolves `account_id` from
  `Number(jwtPayload.sub)` when present, reuses the existing request serializer fields.
- **Excludes `/twhp/api/health`** (parity with `src/index.ts:39`).
- **Records all terminal statuses** including 4xx/5xx (unlike the current stdout
  `autoLogging.ignore`, which skips errors).
- **Secret hygiene (FR-7)**: store `authorization` presence only — never the header value;
  no bodies.

### Out of Scope
- Any read/query/export endpoint (FR-9).
- The retention purge (unit `003-log-retention`).
- Request/response body capture; external log shipping.

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | `network_logs` table | Must |
| FR-2 | Network capture pipeline (non-blocking) | Must |
| FR-7 | Secret & PII hygiene (cross-cutting; network half) | Must |

## Interface (how other code interacts)

- No service is consumed by other code; this unit *observes* the request lifecycle.
- The DB insert is **fire-and-forget** (not awaited); a failed insert is swallowed-and-logged
  exactly like the existing email-queue failure handling — never turns a 2xx into a 5xx.

## Dependencies

- Existing: `src/index.ts` Elysia app + `logger()` plugin; `jwtPlugin` deriving
  `jwtPayload`; Drizzle `db` client.
- No cross-unit/intent dependency.

## Key Risks

- **Hot-path cost**: a row per request on a write path — insert must be off the response
  path (fire-and-forget / async), or it adds latency under load.
- **Unbounded growth** until retention (unit 003) lands — acceptable during construction;
  003 bounds it at 180 days.

## Story Summary

- **Total Stories**: 2
- **Must Have**: 2

### Stories

- [ ] **001-network-logs-table**: `network_logs` Drizzle table - Must - Planned
- [ ] **002-network-capture-pipeline**: Non-blocking per-request capture - Must - Planned
