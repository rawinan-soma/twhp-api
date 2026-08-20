---
id: 011-pagination-regression-coverage
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 028-list-pagination
implemented: true
---

# Story: 011-pagination-regression-coverage

## User Story

**As a** maintainer of the TWHP API
**I want** automated coverage of the pagination contract and of the two SQL rewrites
**So that** a page boundary error or a silent change in list membership is caught by a test rather
than by a staff user

## Acceptance Criteria

- [ ] **Given** the pagination query schema, **When** tests run, **Then** they cover omitted
  parameters, explicit parameters, and rejection of `page=0`, `limit=0`, `limit=101`, and
  non-numeric values.
- [ ] **Given** a paginated endpoint, **When** tests run, **Then** they cover the last partial page,
  a page beyond the end, and an empty result set, asserting status 200 and accurate metadata in each
  case.
- [ ] **Given** an active filter, **When** tests run, **Then** they assert `total` and `totalPages`
  correctness for both the Enrollment `coverStatus` filter and the Score Report status filter.
- [ ] **Given** a fixed data set, **When** a test iterates every page in sequence, **Then** it
  asserts that each row appears exactly once, proving page stability.
- [ ] **Given** the Enrollment Cover-status rewrite, **When** a parity test runs, **Then** it asserts
  that the SQL implementation returns the same Enrollment membership as the previous JavaScript
  implementation for the same data, including the `none` case.
- [ ] **Given** the Score Report rewrite, **When** a parity test runs, **Then** it asserts identical
  Score, Category Score, and Grade output per Cover compared to the previous implementation.
- [ ] **Given** all three roles, **When** tests run, **Then** at least one resource family is covered
  for Admin, Evaluator, and Provincial Officer, proving role parity.

## Technical Notes

- Extend the existing test layout: focused service tests alongside the existing
  `score.test.ts`, and database-backed tests alongside the existing `*.integration.test.ts` files.
- Parity tests are the safeguard for the highest risk in this intent. Write them before either
  JavaScript filter is deleted, and keep the old path available until they pass.
- Latest-log-wins ordering needs coverage in both directions: an older `finished` log followed by a
  newer non-finished log, and the reverse.
- Integration tests may run only against an explicitly confirmed disposable, migrated, seeded
  database. Report them as skipped with the reason when that precondition is not met.
- Assert on the envelope explicitly, so an accidental return to a bare array fails a test.

## Dependencies

### Requires

- 004-factory-list-pagination
- 006-enrollment-list-pagination
- 009-score-list-pagination

### Enables

- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Enrollments sharing an `enrollDate` across a page boundary | The tiebreaker keeps them in a stable order; no duplicate or skip |
| `total` is an exact multiple of `limit` | The final page is full and the next page is empty, not an error |
| A Cover with no CoverLog present in the data set | Excluded from Score Reports, matching current behavior |

## Out of Scope

- Load or performance benchmarking.
- Testing the deferred bulk-export surface.
