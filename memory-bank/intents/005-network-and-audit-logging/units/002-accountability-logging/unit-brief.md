---
unit: 002-accountability-logging
intent: 005-network-and-audit-logging
phase: inception
status: draft
created: 2026-06-22T00:00:00Z
updated: 2026-06-22T00:00:00Z
---

# Unit Brief: Accountability (Audit) Logging

## Purpose

Provide the **who-did-what trail**: an append-only `audit_logs` table plus an
`auditService.record()` helper, and instrument every **state-changing domain action** and
every **auth/authz event** so each is recorded with actor, action, target entity, outcome,
and non-sensitive metadata. Additive to the existing `coverLogs` / `answerLogs` status-history
tables (which **remain**); `audit_logs` is cross-cutting and also covers auth, enrollment,
and score actions those tables never recorded.

## Scope

### In Scope
- **`audit_logs` Drizzle table** in `src/drizzle/schema.ts`: `id` (serial PK), `account_id`
  (nullable int, **no FK**), `actor_role` (nullable; a `Role` value when known), `action`
  (text, e.g. `cover.finalize`, `answer.verdict`, `auth.login`), `entity_type` (nullable),
  `entity_id` (nullable int), `metadata` (nullable `jsonb`), `outcome` (`success`|`failure`),
  `ip` (nullable), `request_id` (nullable), `created_at`. **Append-only** (INSERT-only at the
  app layer). Applied via `bun run db:push`.
- **`auditService`** (`src/service/audit.ts`) via the `createAuditService(db)` factory +
  singleton pattern — a `record(...)` helper used by routes/services.
- **Actor attribution (FR-6)**: `account_id` from verified `Number(jwtPayload.sub)`,
  `actor_role` from the RBAC/JWT context; `null` for unauthenticated / pre-auth events.
  No FK (mirrors `answerLogs.evaluation_id` / `coverLogs.evaluator_id`).
- **Domain instrumentation (FR-4)**: emit a row at each state-changing mutation — cover
  lifecycle transitions, answer submit / verdict / finalize, factory negotiation actions,
  enrollment create/update, score-affecting mutations. GETs are **not** audited.
- **Auth/authz instrumentation (FR-5)**: login success/failure, logout, 2FA challenge
  issued/verified/failed (intent 002 if present), token refresh, role/permission change.
- **Secret hygiene (FR-7)**: never store password/JWT/refresh/OTP/raw `Authorization`;
  `metadata` restricted to non-sensitive, action-relevant fields; no bodies.

### Out of Scope
- Any read/query/export endpoint (FR-9).
- The retention purge (unit `003-log-retention`).
- Replacing `coverLogs` / `answerLogs` — they stay.
- A constrained `pgEnum` for `action` (use typed string constants + `text` — Open Question,
  Construction may revisit).

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-3 | `audit_logs` table | Must |
| FR-4 | Audit: state-changing domain actions | Must |
| FR-5 | Audit: auth & authz events | Must |
| FR-6 | Actor attribution | Must |
| FR-7 | Secret & PII hygiene (cross-cutting; audit half) | Must |

## Interface (how other code interacts)

- `auditService.record({ accountId, actorRole, action, entityType, entityId, outcome, ip,
  requestId, metadata })` — single entry point, callable from any route/service.
- Where an audit row logically belongs to a domain transaction, prefer recording **within**
  that txn; never let the audit write block the txn's success path.

## Dependencies

- Existing model + services it instruments: `answer.ts`, `evaluator-review.ts`, enroll/cover/
  score services, `authentication.ts`, `middleware/jwt.ts`, `middleware/rbac.ts`.
- Drizzle `db` client; `Role` enum (`src/service/authentication.ts`).
- No cross-intent hard dependency (logs whatever auth/domain actions exist today; extends to
  2FA events when intent 002 lands).

## Key Risks

- **Breadth of instrumentation**: "all state-changing actions" touches many existing
  services — must be additive and must not change their behaviour or failure semantics.
- **Double-logging vs. status-history**: `audit_logs` overlaps `coverLogs`/`answerLogs` for
  cover/answer transitions; accepted (both kept) — keep the audit `action`/`metadata`
  meaningful rather than a duplicate of status history.
- **Pre-auth attribution**: failed logins have no `account_id`; record `null` + safe
  metadata, never the attempted password.

## Story Summary

- **Total Stories**: 3
- **Must Have**: 3

### Stories

- [ ] **001-audit-logs-table-and-service**: `audit_logs` table + `auditService.record()` + attribution - Must - Planned
- [ ] **002-domain-action-audit**: Instrument state-changing domain mutations - Must - Planned
- [ ] **003-auth-event-audit**: Instrument auth/authz events - Must - Planned
