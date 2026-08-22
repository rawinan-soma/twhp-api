---
id: 003-factory-grace-window-policy
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 033-out-of-year-writes
implemented: false
---

# Story: 003-factory-grace-window-policy

## User Story

**As a** maintainer of a rule that grants and then withdraws a permission on a date
**I want** the grace window declared once, in one place
**So that** the window cannot move in one service and not another, admitting a Factory on one
request and refusing it on the next

## Acceptance Criteria

- [ ] **Given** the grace policy, **When** it is defined, **Then** it exists as a single declared
  value covering 2026-10-01 → 2026-10-31 inclusive — 31 days — and no service contains a competing
  literal.
- [ ] **Given** an instant and a target fiscal year, **When** the policy is consulted, **Then** it
  answers whether Factory grace applies, using the unit-001 resolver rather than host-local date
  arithmetic.
- [ ] **Given** a target year that is the current one, **When** the policy is consulted, **Then**
  grace is irrelevant — normal current-year authority applies and the policy does not gate it.
- [ ] **Given** a target year two or more years behind the current one, **When** the policy is
  consulted, **Then** grace does not apply; the window covers only the immediately preceding year.
- [ ] **Given** the boundary instants, **When** evaluated at 2026-10-31 23:59:59.999 Bangkok,
  **Then** grace applies; **When** evaluated at 2026-11-01 00:00:00.000 Bangkok, **Then** it does not.
- [ ] **Given** the policy value, **When** the window needs to change, **Then** it changes in one
  place with no service edit.

## Technical Notes

- Whether this is a constant, a config entry, or an env var is a design decision for the bolt. If it
  becomes an env var it must be validated at startup in `src/config.ts` like every other — the
  project forbids reaching for `Bun.env` directly elsewhere.
- The window is expressed relative to a fiscal-year boundary, not as two hard-coded 2026 dates, so
  that it continues to mean "31 days after rollover" in FY2028 without an edit. The 2026 dates are
  the first instance of a recurring rule, not the rule itself.
- Grace is evaluated **at write time**. There is no scheduled job, no sweep, and no persisted flag —
  consistent with the no-schema-change constraint and with the FR-7 decision that expiry changes who
  may write rather than what the Cover is.
- Consult the same resolver as everything else. A second date derivation here would reintroduce
  precisely the divergence this intent is reducing.

## Dependencies

### Requires

- 001-fiscal-year-resolver (unit `001-fiscal-year-reads`)
- 002-past-year-write-authority

### Enables

- 004-grace-window-cover-completion
- 005-concurrent-open-year-disambiguation

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Request at 2026-10-15 targeting FY2026 | Grace applies |
| Request at 2026-10-15 targeting FY2025 | Grace does not apply; only the immediately preceding year is covered |
| Request at 2026-12-01 targeting FY2026 | Grace has lapsed |
| Request at 2026-09-15 targeting FY2026 | FY2026 is current; grace is not consulted |
| Host clock in a non-Bangkok timezone | Identical decision, since the resolver is timezone-pinned |

## Out of Scope

- Applying the policy to any write path, owned by story 004.
- Notifying Factories that the window has opened or closed. No notification exists in this intent.
- Extending grace to enrollment editing.
