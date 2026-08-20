---
id: 001-pagination-query-contract
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 025-list-pagination
implemented: true
---

# Story: 001-pagination-query-contract

## User Story

**As a** staff client of any TWHP list endpoint
**I want** one consistent pair of `page` and `limit` query parameters with safe defaults and bounds
**So that** I can request a predictable slice of a list and can never request an unbounded one

## Acceptance Criteria

- [ ] **Given** a request with no pagination parameters, **When** the route validates the query,
  **Then** `page` resolves to `1` and `limit` resolves to `20`.
- [ ] **Given** a request with `page=3&limit=50`, **When** the route validates the query, **Then**
  both values are accepted and applied as given.
- [ ] **Given** a request with `page=0`, `page=-1`, `limit=0`, or `limit=101`, **When** the route
  validates the query, **Then** the API returns `400`.
- [ ] **Given** a request with a non-numeric `page` or `limit`, **When** the route validates the
  query, **Then** the API returns `400`.
- [ ] **Given** an endpoint with existing filters, **When** the pagination schema is composed into
  its query schema, **Then** every existing filter is still accepted and validated as before.

## Technical Notes

- Primary seam: a new shared schema module under `src/schema/`, exporting the pagination query
  schema and its `Static` type.
- Compose with `t.Composite` into each route's existing query object rather than replacing it, so
  existing filters keep their declarations and OpenAPI documentation.
- Query values arrive as strings; rely on Elysia's query coercion as the existing `region` and
  `validated` parameters already do.
- Bounds belong in the schema, not in service code, so that rejection happens before any query runs.

## Dependencies

### Requires

- None

### Enables

- 002-pagination-response-envelope
- 004-factory-list-pagination

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `page` supplied without `limit` | `limit` defaults to 20 |
| `limit` supplied without `page` | `page` defaults to 1 |
| `limit=100` | Accepted; the maximum is inclusive |
| Fractional value such as `limit=1.5` | Rejected with 400 |

## Out of Scope

- The response envelope shape, owned by story 002.
- Per-endpoint tuning of defaults or maximums.
