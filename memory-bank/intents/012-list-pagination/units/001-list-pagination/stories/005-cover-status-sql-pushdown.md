---
id: 005-cover-status-sql-pushdown
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 026-list-pagination
implemented: true
---

# Story: 005-cover-status-sql-pushdown

## User Story

**As a** staff client filtering Enrollments by Cover status
**I want** the Cover-status filter to be applied by the database rather than after the query returns
**So that** a filtered page is full and the reported total matches the filtered result

## Acceptance Criteria

- [ ] **Given** the Enrollment list queries, **When** Cover status is resolved, **Then** it is
  derived inside SQL from the CoverLog row with the greatest `id` for that Cover, not by timestamp
  and not in JavaScript.
- [ ] **Given** `coverStatus=finished`, `in_progress`, or `in_review`, **When** the list is
  returned, **Then** the Enrollment membership is identical to the membership produced by the
  current implementation for the same data.
- [ ] **Given** `coverStatus=none`, **When** the list is returned, **Then** it contains exactly the
  Enrollments that have no Cover, expressed in SQL as an absent join rather than a status
  comparison.
- [ ] **Given** no `coverStatus` parameter, **When** the list is returned, **Then** all Enrollments
  in scope are returned and each item still projects `coverId` and `coverStatus` as nullable values.
- [ ] **Given** an active `coverStatus` filter, **When** `meta.total` is computed, **Then** it equals
  the number of Enrollments matching both the scope filter and the Cover-status filter.
- [ ] **Given** an Enrollment whose Cover has several CoverLogs, **When** its status is resolved,
  **Then** the greatest-ID row wins regardless of timestamp order.
- [ ] **Given** the response item shape, **When** it is compared to the current implementation,
  **Then** no field is added, removed, renamed, or recased.

## Technical Notes

- Primary seam: `enrichAndFilterCovers` in `src/service/enroll.ts`. The two JavaScript filter lines
  at the end of that helper are what must disappear.
- The current shape is three round trips: fetch every Enrollment, fetch its Covers, fetch the latest
  CoverLog per Cover, then filter in memory. The target is one query whose `WHERE` clause can see the
  resolved status.
- A lateral join or a `DISTINCT ON` subquery over `coverLogs` ordered by `id` descending both express
  latest-log-wins. Choose based on the plan the database produces.
- `coverStatus=none` is not a status value. It means the Enrollment has no Cover at all, so it needs
  a left join and a null test.
- Write the parity test before deleting the JavaScript filter. A membership change produces no error
  and would be invisible to staff.
- Measure the new query. If it needs an index, raise it for human review rather than adding a
  migration.

## Dependencies

### Requires

- 003-deterministic-list-ordering

### Enables

- 006-enrollment-list-pagination

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Enrollment has a Cover but that Cover has no CoverLog | `coverStatus` is null, matching current behavior; excluded by any status filter |
| Enrollment has no Cover | `coverId` and `coverStatus` are null; matched only by `coverStatus=none` |
| Older log is `finished`, greatest-ID log is `in_review` | Resolves to `in_review` |
| Greatest-ID log has an earlier timestamp than an older row | ID ordering is authoritative |

## Out of Scope

- Changing the meaning of any `coverStatus` value.
- Applying pagination to the Enrollment routes, owned by story 006.
