---
id: 002-fiscal-year-query-contract
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 029-fiscal-year-reads
implemented: false
---

# Story: 002-fiscal-year-query-contract

## User Story

**As a** frontend client reading TWHP data
**I want** one consistent, optional `fiscalYear` query parameter across every fiscal-scoped endpoint
**So that** I can request a nominated year the same way everywhere, and keep today's behaviour by
simply not sending it

## Acceptance Criteria

- [ ] **Given** a shared query schema, **When** it is defined, **Then** `fiscalYear` is
  `t.Optional(t.Numeric({ multipleOf: 1, ... }))` so that a string query value coerces and a
  fractional year such as `?fiscalYear=2026.5` is rejected before reaching date arithmetic.
- [ ] **Given** the schema, **When** it is composed into a route, **Then** it composes alongside
  `PaginationQuery` (`src/schema/pagination.ts:32`) without either schema being redefined.
- [ ] **Given** a request omitting `fiscalYear`, **When** it is handled, **Then** the current fiscal
  year is used and the response is byte-identical to today's.
- [ ] **Given** a malformed value — non-numeric, fractional, or out of the declared range — **When**
  the request is validated, **Then** it is rejected with the existing `VALIDATION` 400 flow before
  any query runs.
- [ ] **Given** a valid year, **When** it reaches the service layer, **Then** it arrives as a
  resolved window from story 001; no route or service constructs date boundaries itself.
- [ ] **Given** the OpenAPI document, **When** it is generated, **Then** `fiscalYear` is described
  on every route that accepts it, stating Common Era and the omitted-means-current default.

## Technical Notes

- Follow `src/schema/pagination.ts` exactly, including its reasoning: `t.Numeric` rather than
  `t.Number` because query values arrive as strings, and `multipleOf: 1` because `t.Numeric` maps to
  JSON-schema `number`.
- Declare a sane range. Unbounded input reaching `new Date(year, ...)` produces `Invalid Date`
  rather than an error, which would surface as an empty page instead of a 400.
- The parameter is Common Era. Buddhist Era conversion belongs to the frontend and no BE value
  crosses the API in either direction.
- Preserve the project convention that services return `status(code, body)` rather than throwing.

## Dependencies

### Requires

- 001-fiscal-year-resolver

### Enables

- 003-staff-list-fiscal-year-addressing
- 004-factory-self-read-fiscal-year-addressing

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `?fiscalYear=` (empty value) | Treated as omitted; current fiscal year |
| `?fiscalYear=2026.5` | 400 via the existing validation flow |
| `?fiscalYear=abc` | 400 via the existing validation flow |
| `?fiscalYear=999999` | 400 — outside the declared range, never an `Invalid Date` window |
| `?fiscalYear=2026&page=2&limit=10` | Both schemas apply; neither interferes with the other |

## Out of Scope

- Applying the parameter to specific endpoints, owned by stories 003 and 004.
- Any write-path parameter. Writes derive their target year from the record, not from a query
  parameter; authorisation for them belongs to unit `002-out-of-year-writes`.
