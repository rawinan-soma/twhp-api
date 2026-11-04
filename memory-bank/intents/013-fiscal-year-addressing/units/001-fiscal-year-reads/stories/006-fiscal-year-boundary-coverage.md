---
id: 006-fiscal-year-boundary-coverage
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 031-fiscal-year-reads
implemented: false
---

# Story: 006-fiscal-year-boundary-coverage

## User Story

**As a** maintainer of a system whose fiscal-year identity is derived rather than stored
**I want** the boundary rule pinned down by tests
**So that** the one thing this intent chose not to persist cannot drift silently

## Acceptance Criteria

- [ ] **Given** the resolver, **When** tested at 2026-09-30 23:59:59.999 Bangkok, **Then** FY2026;
  **When** tested at 2026-10-01 00:00:00.000 Bangkok, **Then** FY2027.
- [ ] **Given** the full test suite, **When** run under `TZ=UTC` and again under `TZ=Asia/Bangkok`,
  **Then** every fiscal-year assertion produces identical results.
- [ ] **Given** a fiscal year containing Feb 29, **When** its window is resolved, **Then** the
  arithmetic is correct and no day is skipped or double-counted.
- [ ] **Given** each addressed read path, **When** a past year is requested, **Then** role scoping is
  asserted per role: Factory to itself, Provincial to its province, Evaluator to its region, DOED
  national.
- [ ] **Given** paginated addressed reads, **When** `meta.total` and the page are compared, **Then**
  they agree under every combination of `fiscalYear` with the existing filters.
- [ ] **Given** every endpoint touched by this unit, **When** called without `fiscalYear`, **Then** a
  parity assertion proves the response is unchanged from pre-intent behaviour.
- [ ] **Given** a Factory attempting to address another Factory's year, **When** the request runs,
  **Then** the existing refusal holds; no parameter value widens scope.

## Technical Notes

- `docs/testing.md:118` already names fiscal-year boundary behaviour — Bangkok Sep 30/Oct 1
  boundaries, leap years, host-timezone independence, and query scoping across
  enroll/Cover/answer/score/factory — as a testing concern. This story discharges that entry rather
  than inventing a new one.
- The parity assertions matter more than usual here. The compatibility NFR is "zero response changes
  when `fiscalYear` is omitted", and a refactor of `getFiscalYear` touches sixteen call sites
  indirectly. Parity is the evidence for that claim.
- Follow the existing integration-test conventions in `src/service/*.integration.test.ts`, including
  `factory-pagination.integration.test.ts:157`, which already exercises `getFiscalYear()`.
- Time must be injectable or controllable in tests. If the resolver reads the clock directly, the
  boundary assertions cannot be written — this constrains story 001's design, so verify the seam is
  present rather than discovering it here.

## Dependencies

### Requires

- 001-fiscal-year-resolver
- 002-fiscal-year-query-contract
- 003-staff-list-fiscal-year-addressing
- 004-factory-self-read-fiscal-year-addressing
- 005-fiscal-year-in-responses

### Enables

- Unit `002-out-of-year-writes`, which relies on the same resolver for grace-window boundaries

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A row written by PostgreSQL's `CURRENT_TIMESTAMP` near a boundary | Test documents the observed behaviour. The PostgreSQL container does not set `TZ` (`docs/database.md:372`); this coverage records what actually happens rather than asserting a resolution the intent did not build |
| Test host in a non-Bangkok timezone | All assertions still pass; this is the point of the host-independence criterion |
| Existing duplicate enrollments in one fiscal year | Covered as a documented nondeterminism, not asserted as deterministic |

## Out of Scope

- Fixing the PostgreSQL-side `timestamp without time zone` ambiguity (BR-06). This unit bounds it to
  one application-side rule and documents the residue; it does not resolve it.
- Load or performance benchmarking. The performance NFR is "no regression", and the predicate shape
  is unchanged.
