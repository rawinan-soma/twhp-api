---
id: 002-pagination-response-envelope
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 025-list-pagination
implemented: true
---

# Story: 002-pagination-response-envelope

## User Story

**As a** staff client rendering a paginated list view
**I want** every paginated endpoint to return the page items together with accurate pagination
metadata
**So that** I can display the current page, the total result count, and the number of pages without
guessing

## Acceptance Criteria

- [ ] **Given** any paginated endpoint, **When** it returns `200`, **Then** the body is
  `{ items, meta }` where `meta` contains `page`, `limit`, `total`, and `totalPages`.
- [ ] **Given** a successful page response, **When** the client inspects `items`, **Then** it holds
  at most `limit` entries, each with its existing field names and casing unchanged.
- [ ] **Given** a request that applied defaults, **When** the client inspects `meta`, **Then**
  `meta.page` and `meta.limit` report the effective values actually used, not the raw query.
- [ ] **Given** a filtered request, **When** the client inspects `meta.total`, **Then** it equals the
  count of rows matching the complete filter predicate, not the number of items returned.
- [ ] **Given** `total` of `0`, **When** the response is built, **Then** `items` is `[]` and
  `totalPages` is `0`.
- [ ] **Given** a request for a page beyond the last page, **When** the endpoint responds, **Then**
  it returns `200` with `items: []` and accurate `meta`, never `404`.
- [ ] **Given** an existing error path such as `404 invalid evaluator`, **When** it triggers,
  **Then** the response is unchanged and is not wrapped in the envelope.

## Technical Notes

- Primary seam: the same shared schema module as story 001, exporting a generic wrapper that
  composes any item schema into the envelope, plus a service-side page builder that computes
  `totalPages`.
- `meta` field names are camelCase on every endpoint, including the Factory lists whose items are
  snake_case. Casing consistency belongs to the envelope, not to the items.
- `totalPages` is `ceil(total / limit)`. Keep the arithmetic in one helper so no route recomputes it.
- The envelope is introduced for these nine endpoints only. It must not become a global wrapper.

## Dependencies

### Requires

- 001-pagination-query-contract

### Enables

- 004-factory-list-pagination
- 006-enrollment-list-pagination
- 009-score-list-pagination

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Last page is partial | `items` holds fewer than `limit` entries; `meta` is still accurate |
| `total` smaller than `limit` | One page; `totalPages` is 1 |
| Result set changes between the count and the fetch | Accepted; the count is a point-in-time value |

## Out of Scope

- `hasNext` and `hasPrev` fields; both are derivable from `page` and `totalPages`.
- Wrapping any endpoint outside the nine in scope.
