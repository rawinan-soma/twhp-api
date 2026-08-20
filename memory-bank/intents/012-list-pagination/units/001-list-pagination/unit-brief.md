---
unit: 001-list-pagination
intent: 012-list-pagination
phase: inception
status: complete
created: 2026-08-19T02:20:30.000Z
updated: 2026-08-19T02:20:30.000Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: List Pagination

## Purpose

Bound the result size of every staff-facing list endpoint. Introduce one shared offset-pagination
contract — `page` and `limit` in, `{ items, meta }` out — and apply it to the nine unbounded Factory,
Enrollment, and Score Report list endpoints. Rewrite the two list filters that currently run in
JavaScript so that PostgreSQL performs the filtering, counting, ordering, and page slicing in one
pass.

## Scope

### In Scope

- A shared pagination query schema (`page`, `limit`) composed into nine existing route query schemas.
- A shared response envelope schema and a page-building helper used by all nine endpoints.
- A deterministic total order on every paginated query, including the Score Report queries which
  currently have no `ORDER BY`.
- Moving the Enrollment Cover-status filter from JavaScript into the SQL predicate.
- Moving the Score Report `in_review`/`finished` filter from JavaScript into the SQL predicate.
- Restricting the Score Report Answer read to the Cover IDs on the requested page.
- Correcting `docs/api-conventions.md` and the OpenAPI query and response schemas.
- Regression coverage for page boundaries and parity coverage for the two SQL rewrites.

### Out of Scope

- Bulk or full-data-set export. Deferred to its own intent.
- Cursor pagination and client-selected sorting.
- Pagination of bounded collections: the Question set, per-Cover Answer reads, and location
  reference lists.
- Any change to item field names, casing, filters, role guards, region and province scoping, or
  fiscal-year scoping.
- Any endpoint addition, removal, or rename; any database schema change or Drizzle migration.
- The frontend migration itself, which is an external consumer change.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Shared pagination query contract | Must |
| FR-2 | Standard pagination response envelope | Must |
| FR-3 | Deterministic total ordering for stable pagination | Must |
| FR-4 | Cover-status filter pushed down to SQL for Enrollment lists | Must |
| FR-5 | Score Report status filter pushed down and Answer fan-out scoped to the page | Must |
| FR-6 | Existing filters, authorization, and scoping unchanged | Must |
| FR-7 | Documentation and OpenAPI reflect the new contract | Must |
| FR-8 | Pagination regression coverage | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Relevant attributes |
|--------|-------------|---------------------|
| Page Request | Client-supplied slice selector | `page` (1-indexed), `limit` |
| Pagination Meta | Envelope metadata describing the slice | `page`, `limit`, `total`, `totalPages` |
| Factory list item | Existing snake_case registry projection | `account_id`, `name_th`, `is_validate` |
| Enrollment list item | Existing camelCase Enrollment projection | Enrollment columns, `coverId`, `coverStatus` |
| Score Report | Existing role-scoped read model | `coverId`, `coverStatus`, nullable `grade`, `scoring` |
| Cover | Scoring boundary whose current status gates both filters | `id`, `enrollId` |
| CoverLog | Append-only Cover state event; greatest ID is current | `id`, `coverId`, `status` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| Resolve effective page | Apply defaults and bounds to the query | `page?`, `limit?` | Effective `page`, `limit` |
| Count matching rows | Count rows under the complete filter predicate | Filter predicate | `total` |
| Fetch page | Order deterministically, then `LIMIT`/`OFFSET` | Predicate, order, page | Item rows |
| Build envelope | Combine items with computed metadata | Items, `total`, `page`, `limit` | `{ items, meta }` |
| Resolve current Cover status in SQL | Join the greatest-ID CoverLog per Cover | Cover rows | Status usable in `WHERE` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 11 |
| Must Have | 11 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-pagination-query-contract | Shared page and limit query schema | Must | Ready |
| 002-pagination-response-envelope | Shared items and meta envelope | Must | Ready |
| 003-deterministic-list-ordering | Total order on every paginated query | Must | Ready |
| 004-factory-list-pagination | Paginate the three Factory list endpoints | Must | Ready |
| 005-cover-status-sql-pushdown | Move the Enrollment Cover-status filter into SQL | Must | Ready |
| 006-enrollment-list-pagination | Paginate the three Enrollment list endpoints | Must | Ready |
| 007-score-status-sql-pushdown | Move the Score Report status filter into SQL | Must | Ready |
| 008-page-scoped-answer-fanout | Read Answers for the page's Covers only | Must | Ready |
| 009-score-list-pagination | Paginate the three Score Report endpoints | Must | Ready |
| 010-pagination-contract-documentation | Correct API conventions and OpenAPI | Must | Ready |
| 011-pagination-regression-coverage | Boundary and parity test coverage | Must | Ready |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-score-service` (intent `001`) | Owns Score Report calculation and list read paths |
| `001-enroll-cover-filter` (intent `007`) | Owns the Cover-status filter semantics being pushed down |
| `001-finished-cover-reward-guard` (intent `011`) | Owns the finished-only Grade rule the rewrite must preserve |

All dependencies are already implemented.

### Depended By

| Unit | Reason |
|------|--------|
| Future export unit | A deferred bulk-export intent will serve the full-data need this unit intentionally caps |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| PostgreSQL | Filtering, counting, ordering, and page slicing | Medium: the two rewrites must reproduce current filter membership exactly; integration validation needs a disposable test DB |
| Frontend client | Consumes all nine endpoints | High: the clean break requires a coordinated release; an unmigrated client shows only the first page |

## Technical Context

### Suggested Technology

Use the existing Bun, TypeScript, ElysiaJS, Drizzle/PostgreSQL, TypeBox, and Bun test stack. Add no
dependency.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Admin Factory/Enrollment/Score routes | Existing APIs | REST |
| Evaluator Factory/Enrollment/Score routes | Existing APIs | REST |
| Provincial Officer Factory/Enrollment/Score routes | Existing APIs | REST |
| Factories, Enrolls, Covers, CoverLogs, Answers, Questions | Existing database | Drizzle/PostgreSQL |
| OpenAPI document | Generated from route schemas | HTTP |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| All list source tables | Existing PostgreSQL tables | Unchanged | Unchanged |
| Pagination metadata | Derived per request | Not persisted | Request lifetime |

## Constraints

- Offset-based pagination only, per `memory-bank/standards/api-conventions.md`. Page starts at 1.
- `limit` defaults to 20, minimum 1, maximum 100. `page` defaults to 1, minimum 1.
- The envelope is unconditional on these nine endpoints and is introduced nowhere else.
- Cover status resolution uses the greatest `CoverLogs.id`, never a timestamp.
- No schema change and no migration. Index additions require human review.
- Services keep the `createXxxService(db)` factory plus singleton pattern and must return
  `status(code, body)` rather than throwing.
- The pagination query schema must compose into existing route query schemas, not replace them.
- Integration tests may run only against an explicitly confirmed disposable, migrated, seeded DB.

## Success Criteria

### Functional

- [ ] All nine endpoints accept `page` and `limit` and reject out-of-range values with 400.
- [ ] All nine endpoints return `{ items, meta }` with correct `total` and `totalPages`.
- [ ] A page beyond the last page returns 200 with an empty `items` array.
- [ ] Enrollment `coverStatus` filtering, including `none`, returns the same membership as today.
- [ ] Score Reports exclude `in_progress` Covers by SQL predicate and preserve `grade: null` for
  `in_review`.
- [ ] Iterating every page over a fixed data set yields each row exactly once.

### Non-Functional

- [ ] No list response exceeds 100 items.
- [ ] Answer rows read per Score Report request are bounded by the page size.
- [ ] One count query per list request.
- [ ] No item field renamed, recased, or removed; no endpoint added, removed, or renamed.

### Quality

- [ ] All acceptance criteria met.
- [ ] Parity tests prove the two SQL rewrites match the current implementation before the
  JavaScript path is removed.
- [ ] Focused tests pass; integration tests pass or are reported as skipped with the reason.
- [ ] Non-mutating Biome diagnostics reported as baseline versus introduced findings.

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 025-list-pagination | DDD | 001, 002, 003, 004 | Establish the shared contract and prove it on the Factory lists |
| 026-list-pagination | DDD | 005, 006 | Push the Cover-status filter into SQL and paginate Enrollment lists |
| 027-list-pagination | DDD | 007, 008, 009 | Push the Score status filter into SQL, scope the Answer read, paginate Score lists |
| 028-list-pagination | DDD | 010, 011 | Correct documentation and complete regression and parity coverage |

## Notes

The Factory lists are deliberately first. They need no filter pushdown and already carry a unique
total order on `accountId`, so they prove the shared contract with the least risk. The Enrollment and
Score Report bolts then reuse a contract that is already validated.

Construction must write the parity tests before deleting either JavaScript filter. A rewrite that
silently changes list membership produces no error and would be invisible to staff users.
