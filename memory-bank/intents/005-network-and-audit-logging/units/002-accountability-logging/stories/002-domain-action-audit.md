---
id: 002-domain-action-audit
unit: 002-accountability-logging
intent: 005-network-and-audit-logging
status: draft
priority: must
created: 2026-06-22T00:00:00Z
assigned_bolt: 015-accountability-logging
implemented: false
---

# Story: 002-domain-action-audit

## User Story

**As a** compliance/operations stakeholder
**I want** every state-changing domain action recorded in `audit_logs`, attributed to the actor
**So that** I can reconstruct who changed what (covers, answers/verdicts, enrollments, scores) and when

## Acceptance Criteria

- [ ] **Given** a state-changing domain mutation succeeds, **When** it commits, **Then** an
  `audit_logs` row is written with `action` (e.g. `cover.finalize`, `answer.verdict`,
  `answer.submit`, `enroll.create`, `enroll.update`), `entity_type` + `entity_id`,
  `account_id` + `actor_role`, `outcome: success`, and relevant `metadata`
  (e.g. from→to status, verdict choice)
- [ ] **Given** an action belonging to a domain transaction, **When** recorded, **Then** the
  audit row is preferably written **within** that transaction; the audit write **never**
  blocks or fails the domain operation's success path
- [ ] **Given** a **read-only** operation (GET list, score report), **When** it runs,
  **Then** **no** `audit_logs` row is written (those are covered by the network log)
- [ ] **Given** the existing `coverLogs` / `answerLogs` writes, **When** domain audit is
  added, **Then** those status-history tables are **still written** (audit is additive, not
  a replacement)
- [ ] **Given** instrumentation, **When** added to existing services, **Then** it is
  **additive** — no existing endpoint changes its response shape, status codes, or failure
  behaviour
- [ ] **Given** secret hygiene (FR-7), **When** rows are written, **Then** no secrets/bodies
  are stored in `metadata`

## Technical Notes

- Call `auditService.record(...)` at the mutation sites in `src/service/answer.ts`,
  `src/service/evaluator-review.ts`, and the enroll/cover/score services. Pass the txn
  handle where the mutation runs in a transaction.
- Define a typed set of `action` constants (e.g. `AUDIT_ACTIONS.cover.finalize`) to keep the
  free-text column consistent.
- Keep `metadata` minimal and meaningful (status transitions, ids, choice) — not a dump.
- This story is breadth-heavy: enumerate the mutating operations during the bolt's design
  stage so none is missed.

## Dependencies

### Requires
- 001-audit-logs-table-and-service

### Enables
- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Mutation rolls back | No success row; optionally a `failure` row outside the txn (Construction decides) |
| Audit insert fails mid-txn | Must not abort the domain txn's success — degrade to swallow-and-log |
| Bulk/batch mutation (e.g. verdict batch) | One audit row per logical action, or one summarizing row — decided in design, documented |

## Out of Scope

- Auth/authz events (story 003).
- Retention; any read endpoint.
