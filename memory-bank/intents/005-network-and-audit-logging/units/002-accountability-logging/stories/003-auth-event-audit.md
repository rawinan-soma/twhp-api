---
id: 003-auth-event-audit
unit: 002-accountability-logging
intent: 005-network-and-audit-logging
status: draft
priority: must
created: 2026-06-22T00:00:00Z
assigned_bolt: 015-accountability-logging
implemented: false
---

# Story: 003-auth-event-audit

## User Story

**As a** security/compliance stakeholder
**I want** authentication and authorization events recorded in `audit_logs`
**So that** I can trace logins (including failures), logouts, 2FA, token refresh, and role changes back to an identity

## Acceptance Criteria

- [ ] **Given** a successful login, **When** it completes, **Then** an `audit_logs` row is
  written with `action: auth.login`, `account_id`, `actor_role`, `outcome: success`, `ip`
- [ ] **Given** a **failed** login (or other pre-auth failure), **When** it is rejected,
  **Then** a row is written with `action: auth.login`, `outcome: failure`, `account_id:
  NULL`, and **no password** in `metadata` (an attempted identifier may be recorded if
  non-sensitive)
- [ ] **Given** logout, token refresh, and 2FA events (challenge issued / verified / failed —
  intent 002 if present), **When** they occur, **Then** each writes a corresponding
  `audit_logs` row (`auth.logout`, `auth.refresh`, `auth.2fa.*`) with `outcome`
- [ ] **Given** a role/permission change, **When** it is applied, **Then** an `audit_logs`
  row records `action: auth.role_change` with the target `entity_id` (account) and the
  change in `metadata`
- [ ] **Given** secret hygiene (FR-7), **When** any auth row is written, **Then** no
  password, JWT, refresh token, OTP code, or raw `Authorization` value is stored
- [ ] **Given** instrumentation in the auth flow, **When** added, **Then** it is additive and
  does not change auth responses, status codes, or token behaviour

## Technical Notes

- Hook into `src/service/authentication.ts` (login/logout/refresh), `src/middleware/jwt.ts`
  (refresh/verify outcomes), `src/middleware/rbac.ts` (authz denials, optional), and the 2FA
  flow from intent 002 when present.
- Reuse the `Role` enum for `actor_role`.
- For pre-auth failures, attribution is `NULL`; capture `ip`/`request_id` for correlation.
- 2FA events are best-effort if intent 002 is not yet implemented — wire what exists; the
  table/helper already support these actions.

## Dependencies

### Requires
- 001-audit-logs-table-and-service

### Enables
- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Brute-force failed logins | Each attempt → a `failure` row (`account_id: NULL`); no password stored |
| Refresh-token rotation | Recorded as `auth.refresh` success; no token value stored |
| Authz denial (403 from rbac) | Optional `auth.denied` row (Construction decides scope) |
| 2FA not yet present (intent 002 pending) | No-op for 2FA actions; login/logout/refresh still audited |

## Out of Scope

- Domain mutations (story 002).
- Retention; any read endpoint.
