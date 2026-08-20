---
id: 006-enrollment-list-pagination
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 026-list-pagination
implemented: true
---

# Story: 006-enrollment-list-pagination

## User Story

**As a** DOED Admin, Evaluator, or Provincial Officer reviewing Enrollments
**I want** the Enrollment list endpoints to return one page at a time
**So that** a fiscal-year Enrollment read no longer loads every Enrollment row, with all its
standard-certificate columns, into one response

## Acceptance Criteria

- [ ] **Given** `GET /admins/enrolls`, `GET /evaluators/enrolls`, and
  `GET /provincialOfficers/enrolls`, **When** each is called, **Then** all three accept `page` and
  `limit` and return the shared envelope.
- [ ] **Given** an Enrollment list request, **When** the response is inspected, **Then** each item
  keeps its existing fields, including the joined `factory_name_th`, `region`, `provinceId`, and the
  derived `coverId` and `coverStatus`.
- [ ] **Given** a `coverStatus` filter, **When** the page is returned, **Then** the page holds up to
  `limit` matching Enrollments and is not shortened by post-query filtering.
- [ ] **Given** an Evaluator caller, **When** the list is returned, **Then** it remains scoped to
  that Evaluator's health region.
- [ ] **Given** a Provincial Officer caller, **When** the list is returned, **Then** it remains
  scoped to that officer's province.
- [ ] **Given** any Enrollment list request, **When** the fiscal year is resolved, **Then** it still
  comes from the shared fiscal-year utility and the date window is unchanged.

## Technical Notes

- Primary seam: `getAllEnrolls` and `getAllEnrollsByProvince` in `src/service/enroll.ts`, plus their
  three route files.
- This story depends on story 005. Applying `LIMIT` before the Cover-status filter moves into SQL
  would produce short pages and a wrong total.
- Enrollment items are wide: the base Enrollment row includes eleven standard-certificate URL
  columns. Bounding the row count is what makes this response size predictable.
- `EnrollWithCoverListSchema` in `src/schema/enroll.ts` is replaced by the envelope wrapping the
  existing item schema. The item schema itself does not change.

## Dependencies

### Requires

- 002-pagination-response-envelope
- 005-cover-status-sql-pushdown

### Enables

- 010-pagination-contract-documentation
- 011-pagination-regression-coverage

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A fiscal year with no Enrollments in scope | `items: []`, `total: 0`, `totalPages: 0`, status 200 |
| `coverStatus=none` with pagination | Pages contain only Enrollments without a Cover; total matches |
| Provincial Officer account that cannot be resolved | Existing `404` is returned unwrapped |

## Out of Scope

- Changing the Enrollment item projection or its casing.
- The Score Report endpoints, owned by story 009.
