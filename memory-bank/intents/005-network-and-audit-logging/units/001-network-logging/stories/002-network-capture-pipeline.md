---
id: 002-network-capture-pipeline
unit: 001-network-logging
intent: 005-network-and-audit-logging
status: draft
priority: must
created: 2026-06-22T00:00:00Z
assigned_bolt: 013-network-logging
implemented: false
---

# Story: 002-network-capture-pipeline

## User Story

**As an** operator
**I want** the API to write a `network_logs` row per request without slowing or breaking responses
**So that** traffic is recorded reliably while the request path stays fast and safe

## Acceptance Criteria

- [ ] **Given** any request to `/twhp/api/*` except `/twhp/api/health`, **When** the response
  completes, **Then** exactly one `network_logs` row is written with method, path, matched
  route (when available), final `status`, measured `latency_ms`, `ip` (`x-forwarded-for`),
  `user_agent`, and `account_id` (`Number(jwtPayload.sub)` if authenticated, else `NULL`)
- [ ] **Given** a request to `/twhp/api/health`, **When** handled, **Then** **no**
  `network_logs` row is written (parity with `src/index.ts:39`)
- [ ] **Given** a 4xx or 5xx response, **When** it completes, **Then** a row is **still**
  written (network log records all terminal statuses, unlike the current stdout
  `autoLogging.ignore`)
- [ ] **Given** the DB insert fails, **When** it errors, **Then** the failure is
  swallowed-and-logged and the original HTTP response is **unchanged** (a 2xx never becomes
  a 5xx because of logging)
- [ ] **Given** the write, **When** it runs, **Then** it is **not awaited on the response
  path** (fire-and-forget) — no measurable added p95 latency
- [ ] **Given** secret hygiene (FR-7), **When** a row is written, **Then** it contains **no**
  raw `Authorization` value (presence only), no token, and no request/response body
- [ ] **Given** the existing stdout logging, **When** this capture is added, **Then** the
  `elysia-logger` stdout stream still works exactly as before

## Technical Notes

- Wire into the global Elysia lifecycle in `src/index.ts`, alongside the existing `logger()`
  plugin — reuse its request serializer fields (`method, url, ip, userAgent`,
  `authorization` as boolean). Do **not** stand up a parallel logging framework.
- Measure latency around the request (e.g. capture start in `onRequest`, compute in
  `onAfterResponse`).
- Resolve `account_id` from the derived `jwtPayload` (same `Number(jwtPayload.sub)`
  convention as intent 004); `NULL` when unauthenticated.
- Insert via the Drizzle `db` client; do not `await` it in the response path (or schedule it
  post-response) and wrap in try/catch that logs failures only.

## Dependencies

### Requires
- 001-network-logs-table

### Enables
- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Request throws / error handler returns 500 | Row written with `status: 500`, response unaffected |
| `jwtPayload` absent (public route) | `account_id: NULL` |
| DB momentarily unavailable | Insert error swallowed-and-logged; response still returned |
| Health check spam | Never logged |

## Out of Scope

- Table definition (story 001).
- Retention (unit 003); any read endpoint.
