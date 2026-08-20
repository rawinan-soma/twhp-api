---
id: 003-deterministic-list-ordering
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 025-list-pagination
implemented: true
---

# Story: 003-deterministic-list-ordering

## User Story

**As a** staff client paging through a list
**I want** every paginated query to have a stable, total order
**So that** paging forward never shows me the same row twice and never skips a row

## Acceptance Criteria

- [ ] **Given** the Factory list queries, **When** ordering is reviewed, **Then** the existing
  `accountId` ascending order is retained and confirmed to be a total order.
- [ ] **Given** the Enrollment list queries, **When** two Enrollments share an `enrollDate`,
  **Then** a unique tiebreaker column decides their relative order deterministically.
- [ ] **Given** the Score Report queries, **When** ordering is reviewed, **Then** an explicit
  deterministic `ORDER BY` is added, because these queries currently have none.
- [ ] **Given** an unchanged data set, **When** every page is requested in sequence, **Then** the
  concatenated result contains each row exactly once, with no duplicates and no omissions.
- [ ] **Given** the same request issued twice against an unchanged data set, **When** the responses
  are compared, **Then** the row order is identical.
- [ ] **Given** the documented ordering in `docs/api-conventions.md`, **When** it is compared to the
  implementation, **Then** the two agree.

## Technical Notes

- A total order requires the final sort key to be unique. `accountId` already satisfies this;
  `enrollDate` does not.
- The Score Report path currently returns rows in whatever order PostgreSQL produces. Without an
  `ORDER BY`, `OFFSET` is meaningless and rows can repeat or vanish between pages.
- Keep the existing primary sort direction so that the visible list order does not change for staff:
  Enrollments stay newest first, Factories stay ascending by account.
- Choose a tiebreaker that is indexed or is the primary key, to avoid a sort regression.

## Dependencies

### Requires

- None

### Enables

- 004-factory-list-pagination
- 006-enrollment-list-pagination
- 009-score-list-pagination

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| All rows share the same `enrollDate` | The tiebreaker alone produces a stable order |
| A row is inserted between two page requests | Accepted drift; offset pagination does not promise a snapshot |
| Empty result set | Ordering is a no-op; the envelope reports zero |

## Out of Scope

- Client-selected sorting.
- Cursor or keyset pagination, which would remove the drift caveat entirely.
