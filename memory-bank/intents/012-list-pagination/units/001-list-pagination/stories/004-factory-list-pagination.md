---
id: 004-factory-list-pagination
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 025-list-pagination
implemented: true
---

# Story: 004-factory-list-pagination

## User Story

**As a** DOED Admin, Evaluator, or Provincial Officer browsing the Factory registry
**I want** the Factory list endpoints to return one page at a time
**So that** a nationwide registry read no longer loads every Factory row into one response

## Acceptance Criteria

- [ ] **Given** `GET /admins/factories`, `GET /evaluators/factories`, and
  `GET /provincialOfficers/factories`, **When** each is called, **Then** all three accept `page` and
  `limit` and return the shared envelope.
- [ ] **Given** a Factory list request, **When** the response is inspected, **Then** each item keeps
  its existing snake_case fields exactly as today, including `province_name_th`, `account_id`,
  `name_th`, and `is_validate`.
- [ ] **Given** the required `validated` filter and the optional `enrolled` filter, **When** either
  is supplied, **Then** its behavior is unchanged, including the current `enrolled=false` behavior
  of disabling the fiscal-year Enrollment-date filter.
- [ ] **Given** an Evaluator caller, **When** the list is returned, **Then** it remains scoped to
  that Evaluator's health region and `meta.total` counts only rows in that region.
- [ ] **Given** a Provincial Officer caller, **When** the list is returned, **Then** it remains
  scoped to that officer's province and `meta.total` counts only rows in that province.
- [ ] **Given** any Factory list request, **When** the database is queried, **Then** exactly one
  count query and one page query are issued.

## Technical Notes

- Primary seam: `getAllFactories`, `getAllFactoriesByRegion`, and `getAllFactoriesByProvinceId` in
  `src/service/factory.ts`, plus their three route files.
- These three endpoints need no filter pushdown. Every filter is already in the `WHERE` clause, and
  `accountId` ascending is already a total order. This is why they are the first application of the
  contract.
- The count query must repeat the same joins and predicate as the page query, including the
  fiscal-year Enrollment join, so that `total` and the page agree.
- Existing role guards stay untouched.

## Dependencies

### Requires

- 001-pagination-query-contract
- 002-pagination-response-envelope
- 003-deterministic-list-ordering

### Enables

- 010-pagination-contract-documentation
- 011-pagination-regression-coverage

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A region or province with no Factories | `items: []`, `total: 0`, `totalPages: 0`, status 200 |
| `enrolled=false` with pagination | The Enrollment-date filter is disabled as today; the count matches the same predicate |
| Evaluator whose account resolves no region | Existing `404 invalid evaluator` is returned unwrapped |

## Out of Scope

- The Enrollment and Score Report endpoints, owned by stories 006 and 009.
- Changing the ambiguous `enrolled=false` semantics, which this intent preserves as-is.
