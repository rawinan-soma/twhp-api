---
id: 001-evaluator-level-guard
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 032-out-of-year-writes
implemented: false
---

# Story: 001-evaluator-level-guard

## User Story

**As a** system enforcing that only ODPC evaluators may touch a closed fiscal year
**I want** a guard that can distinguish evaluator *level*, not merely evaluator *role*
**So that** Mental and DOH evaluators are refused where ODPC is permitted

## Acceptance Criteria

- [ ] **Given** the existing guards, **When** the new one is introduced, **Then** it composes
  `jwtPlugin` and `requireRoles` in the same manner as `evalGuard` (`src/middleware/guards.ts:12`)
  and additionally checks `Evaluators.level`.
- [ ] **Given** an authenticated Evaluator at level `ODPC`, **When** the guard runs, **Then** the
  request proceeds.
- [ ] **Given** an authenticated Evaluator at level `Mental` or `DOH`, **When** the guard runs,
  **Then** the request is refused with a distinct, logged response.
- [ ] **Given** a caller of any other role, **When** the guard runs, **Then** it is refused by the
  existing role check before any level lookup occurs.
- [ ] **Given** the guard, **When** it resolves a level, **Then** it does so from the authenticated
  subject; no level value is accepted from the request.
- [ ] **Given** existing routes using `evalGuard`, **When** this story lands, **Then** none of them
  change behaviour — the new guard is additive.

## Technical Notes

- `evaluatorLevels` is a pgEnum of `Mental` | `DOH` | `ODPC` (`src/drizzle/schema.ts:13`), stored as
  `Evaluators.level` (`src/drizzle/schema.ts:24`). It is **not** a `Role`; `Role` has exactly four
  values (`src/service/authentication.ts:27-32`). This mismatch is why no existing guard can express
  the rule.
- The JWT payload carries `username` and `role` (`src/service/authentication.ts:52-57`) — not level.
  The guard therefore needs a lookup. Decide deliberately whether to query per request or to widen
  the token, and record the choice; widening the token affects session lifetime and rotation, so a
  lookup is the conservative default.
- Follow the pre-composed guard convention: routes use a named guard, they do not assemble
  `jwtPlugin + requireRoles` themselves (`CLAUDE.md`).
- The refusal must be distinguishable in logs from the wrong-region 404 that review paths already
  return, so that a permission failure is not mistaken for a missing record.

## Dependencies

### Requires

- None within this unit; depends on unit `001-fiscal-year-reads` only insofar as the intent sequences
  it afterwards.

### Enables

- 002-past-year-write-authority

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Evaluator account exists but has no matching `Evaluators` row | Refused, and logged as a data-integrity condition rather than a permission decision |
| Token valid but the evaluator's level changed since issue | The lookup reflects current level; a stale token cannot retain lapsed authority |
| Refresh-token rotation mid-request | Existing rotation behaviour is unchanged; the guard runs after `jwtPlugin` as today |

## Out of Scope

- Applying the guard to any route, owned by story 002.
- Changing region scoping. ODPC authority stays region-scoped per the Checkpoint 2 decision.
- Any change to `evalGuard` or the routes that use it.
