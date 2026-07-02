---
id: 001-audit-logs-table-and-service
unit: 002-accountability-logging
intent: 005-network-and-audit-logging
status: draft
priority: must
created: 2026-06-22T00:00:00Z
assigned_bolt: 014-accountability-logging
implemented: false
---

# Story: 001-audit-logs-table-and-service

## User Story

**As a** compliance/operations stakeholder
**I want** an append-only `audit_logs` table and a single helper to write attributed rows
**So that** every accountable action can be recorded uniformly, with the acting identity, in one place

## Acceptance Criteria

- [ ] **Given** the schema, **When** `bun run db:push` runs, **Then** an `audit_logs` table
  exists with: `id` (serial PK), `account_id` (nullable int, **no FK**), `actor_role`
  (nullable text/enum), `action` (text), `entity_type` (nullable text), `entity_id`
  (nullable int), `metadata` (nullable `jsonb`), `outcome` (`success`|`failure`), `ip`
  (nullable), `request_id` (nullable), `created_at` (timestamp, default now)
- [ ] **Given** the helper, **When** code calls `auditService.record({...})`, **Then** one
  `audit_logs` row is inserted with the supplied fields and `created_at` set
- [ ] **Given** attribution (FR-6), **When** an authenticated actor records an action,
  **Then** `account_id` = `Number(jwtPayload.sub)` and `actor_role` = the verified role;
  **When** unauthenticated/pre-auth, **Then** `account_id` is `NULL` (never fails)
- [ ] **Given** the factory pattern, **When** the service is created, **Then** it follows
  `createAuditService(db)` + exported singleton (`src/service/audit.ts`), matching the
  project's service convention
- [ ] **Given** append-only intent, **When** the service is built, **Then** it exposes
  **only** an insert path — no update/delete method exists
- [ ] **Given** secret hygiene (FR-7), **When** a row is written, **Then** `metadata` carries
  no password/JWT/refresh/OTP/raw `Authorization`; the helper does not log secrets

## Technical Notes

- Add the table to `src/drizzle/schema.ts` (single-file schema; idioms as in
  `coverLogs`/`answerLogs`); `account_id` plain `integer`, no `.references(...)`.
- `action` is a **text** column filled from typed string constants in code (no `pgEnum` —
  Open Question; avoids enum churn). Recommend a const map of action keys.
- `outcome` may be a small `pgEnum` or text constrained in code — Construction decides.
- `auditService.record` should accept an optional caller-supplied DB/txn handle so a row can
  be written **inside** a domain transaction (used by story 002) without blocking it.

## Dependencies

### Requires
- None

### Enables
- 002-domain-action-audit (uses the helper)
- 003-auth-event-audit (uses the helper)
- 003-log-retention/001-retention-purge-job (purges this table)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Pre-auth failed login | `account_id: NULL`, `outcome: failure`, no password in metadata |
| Insert fails outside a txn | Swallowed-and-logged; must not crash the caller |
| `metadata` is large/nested | Stored as `jsonb` (no secret fields) |

## Out of Scope

- Wiring the helper into mutators (story 002) and auth flow (story 003).
- Retention; any read endpoint.
