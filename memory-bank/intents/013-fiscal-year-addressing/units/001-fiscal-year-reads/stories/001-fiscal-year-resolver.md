---
id: 001-fiscal-year-resolver
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 029-fiscal-year-reads
implemented: false
---

# Story: 001-fiscal-year-resolver

## User Story

**As a** developer of any fiscal-scoped query
**I want** one resolver that turns a nominated Common Era year — or the absence of one — into a
fiscal-year window
**So that** every read in the system derives its boundary the same way, once, from an explicit rule
rather than from the host's clock and timezone

## Acceptance Criteria

- [ ] **Given** `getFiscalYear(2026)`, **When** it resolves, **Then** it returns the window
  `[2025-10-01T00:00 +07, 2026-10-01T00:00 +07)`.
- [ ] **Given** `getFiscalYear()` called with no argument, **When** it resolves, **Then** it returns
  the window containing the present instant, and all sixteen existing call sites continue to compile
  and behave exactly as today with no edit to any of them.
- [ ] **Given** any single resolution, **When** it executes, **Then** exactly one clock read occurs;
  the present two-`new Date()` pattern (`src/utils.ts:55-56`) and its rollover race are gone.
- [ ] **Given** the process runs under `TZ=UTC`, **When** any year is resolved, **Then** the result
  is identical to the same resolution under `TZ=Asia/Bangkok`.
- [ ] **Given** an arbitrary instant, **When** the "which fiscal year is this in" helper is called,
  **Then** it returns the Common Era year whose window contains that instant.
- [ ] **Given** the resolver, **When** a caller passes a non-integer or out-of-range year, **Then**
  the failure is explicit, not a silently malformed window.

## Technical Notes

- Primary seam: `utilities().getFiscalYear` at `src/utils.ts:54-64`. This is the only production
  change in this story.
- The canonical definition is normative and stated in `requirements.md`: fiscal year `Y` is
  `[Oct 1 of Y-1, Oct 1 of Y)` in `Asia/Bangkok`, labelled by its **ending** year. Assert this
  directly — an off-by-one here mislabels every historical read in the system.
- Keep the return shape `{ fiscalYearStart, fiscalYearEnd }`. Callers pass these to
  `.toISOString()` against a `timestamp without time zone` column; changing the shape would ripple
  into all sixteen sites and defeat the zero-churn criterion.
- Pinning to `Asia/Bangkok` is a no-op in deployed configuration — every API and worker container
  already sets `TZ=Asia/Bangkok` (`docker-compose.yaml:30`). This removes a dependency on that
  configuration rather than changing behaviour under it. Prove it rather than assume it.
- This resolver is the fiscal-year contract for the whole intent, because no fiscal-year value is
  persisted anywhere. Treat its tests as contract tests.

## Dependencies

### Requires

- None. This is the foundation story of the intent.

### Enables

- 002-fiscal-year-query-contract
- 003-staff-list-fiscal-year-addressing
- 004-factory-self-read-fiscal-year-addressing
- 005-fiscal-year-in-responses
- All of unit `002-out-of-year-writes`

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Resolution at 2026-09-30 23:59:59.999 Bangkok | FY2026 |
| Resolution at 2026-10-01 00:00:00.000 Bangkok | FY2027 |
| Leap year spanning the window (Feb 29 inside FY2024) | Window arithmetic unaffected; no day is skipped or doubled |
| A year far in the past or future, e.g. 2015 or 2040 | A valid window is returned; no clamping, no error. Addressing is open-ended in both directions |
| Host `TZ` unset entirely | Identical result to `TZ=Asia/Bangkok` |

## Out of Scope

- Threading the parameter through routes and services, owned by stories 002–004.
- Persisting the resolved year anywhere. No schema change exists in this intent.
- Resolving the `timestamp without time zone` comparison ambiguity in PostgreSQL itself
  (`docs/business-rules.md` BR-06). This story bounds the ambiguity to one explicit application-side
  rule; it does not eliminate it.
