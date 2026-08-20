---
intent: 012-list-pagination
phase: inception
status: complete
created: 2026-08-18T01:49:01.000Z
updated: 2026-08-19T02:20:30.000Z
---

# Requirements: List Pagination

## Intent Overview

Add offset-based pagination to the nine unbounded staff-facing list endpoints (factory lists,
enrollment lists, and score reports across Admin, Evaluator, and Provincial Officer roles), so that
no single request loads an entire nationwide, region-wide, or province-wide result set into memory.

`memory-bank/standards/api-conventions.md` already commits the project to offset-based pagination
(`?page=1&limit=20`, 1-indexed), but no endpoint implements it. `docs/api-conventions.md` records
the current reality: list routes return complete arrays and accept no `page`, `limit`, or cursor
parameter. This intent closes that standard-versus-implementation gap.

This is a brown-field intent. It changes list response envelopes — a breaking client contract change
— and requires pushing two currently in-JavaScript filters down into SQL before `LIMIT`/`OFFSET` can
produce correct pages and counts.

## Scope

**In scope** — the nine endpoints identified as unbounded:

| Priority | Endpoint | Service function |
|---|---|---|
| P0 | `GET /admins/score` | `score.ts` `getAllScores` |
| P0 | `GET /admins/enrolls` | `enroll.ts` `getAllEnrolls` |
| P0 | `GET /admins/factories` | `factory.ts` `getAllFactories` |
| P1 | `GET /evaluators/score` | `score.ts` `getScoresByRegion` |
| P1 | `GET /evaluators/enrolls` | `enroll.ts` `getAllEnrolls` |
| P1 | `GET /evaluators/factories` | `factory.ts` `getAllFactoriesByRegion` |
| P2 | `GET /provincialOfficers/score` | `score.ts` `getScoresByProvince` |
| P2 | `GET /provincialOfficers/enrolls` | `enroll.ts` `getAllEnrollsByProvince` |
| P2 | `GET /provincialOfficers/factories` | `factory.ts` `getAllFactoriesByProvinceId` |

**Out of scope** — bounded collections that must remain unwrapped arrays:

- `GET /factories/assessments/questions` (fixed question set)
- `GET /factories/assessments/answers` (bounded by question count, single cover)
- `GET /{admins,evaluators}/covers/:coverId/answers` (bounded, category-filtered)
- `GET /location/**` (provinces, districts, subdistricts — bounded by administrative geography)
- All single-resource reads

**Explicitly not in scope**: cursor pagination, client-selected sorting, bulk/full-dataset export,
and any change to item field shapes or casing.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Bound worst-case memory and payload per list request | No in-scope endpoint returns more than `limit` items, and `limit` cannot exceed 100 | Must |
| Align implementation with the documented pagination standard | All nine endpoints accept `page`/`limit` per `standards/api-conventions.md` | Must |
| Keep filters and item contracts intact | Existing filters behave identically; no item field is renamed, recased, or removed | Must |
| Report accurate result counts | `total` reflects rows matching the full filter predicate, not the returned page | Must |
| Keep every staff role consistent | Admin, Evaluator, and Provincial variants share one identical pagination contract | Must |

---

## Functional Requirements

### FR-1: Shared pagination query contract

- **Description**: All nine in-scope endpoints accept two optional query parameters, `page` and
  `limit`, defined once in a shared schema module and composed into each route's existing query
  schema. Page numbering is 1-indexed per the project standard.
- **Acceptance Criteria**:
  - `page` defaults to `1` when omitted; minimum `1`.
  - `limit` defaults to `20` when omitted; minimum `1`, maximum `100`.
  - `page=0`, `page=-1`, `limit=0`, and `limit=101` are rejected with `400` by schema validation.
  - A non-numeric `page` or `limit` is rejected with `400`.
  - Omitting both parameters returns the first page of 20 items, not the full result set.
  - Each endpoint's existing filters remain accepted alongside the pagination parameters.
- **Priority**: Must
- **Related Stories**: 001-pagination-query-contract

### FR-2: Standard pagination response envelope

- **Description**: Every in-scope endpoint returns a wrapper object containing the page's items and
  pagination metadata, replacing the current bare array. The envelope is applied unconditionally —
  it does not depend on whether `page`/`limit` were supplied.
- **Acceptance Criteria**:
  - The `200` body is `{ items: [...], meta: { page, limit, total, totalPages } }`.
  - `items` contains at most `limit` entries, each with its existing field shape and casing
    unchanged (snake_case for factory lists, camelCase for enroll and score lists).
  - `meta` field names are camelCase on every endpoint regardless of item casing.
  - `meta.page` and `meta.limit` echo the effective values actually applied, including defaults.
  - `meta.total` is the count of rows matching the complete filter predicate for the request.
  - `meta.totalPages` equals `ceil(total / limit)`, and equals `0` when `total` is `0`.
  - A request for a page beyond the last page returns `200` with `items: []` and accurate `meta`,
    not `404`.
  - Existing non-200 responses (`404 invalid evaluator`, `404 provincial officer not found`) are
    unchanged and are not wrapped.
- **Priority**: Must
- **Related Stories**: 002-pagination-response-envelope

### FR-3: Deterministic total ordering for stable pagination

- **Description**: Offset pagination over a non-deterministic order can duplicate or skip rows
  between page requests. Every in-scope query must impose a total order — an ordering whose tiebreak
  column is unique.
- **Acceptance Criteria**:
  - Factory lists retain `accountId` ascending, which is already a total order.
  - Enrollment lists retain `enrollDate` descending and gain a unique tiebreaker so that enrolls
    sharing an `enrollDate` have a stable relative order.
  - Score report lists gain an explicit deterministic order; they currently have no `ORDER BY` at
    all, so their row order is not guaranteed by the database.
  - Requesting every page in sequence over an unchanged dataset yields each row exactly once, with
    no duplicates and no omissions.
  - Documented ordering in `docs/api-conventions.md` matches the implemented ordering.
- **Priority**: Must
- **Related Stories**: 003-deterministic-list-ordering

### FR-4: Cover-status filter pushed down to SQL for enrollment lists

- **Description**: `enrichAndFilterCovers` in `src/service/enroll.ts` currently derives each
  enrollment's cover status and applies the `coverStatus` filter in JavaScript, after the enrollment
  query has returned every matching row. Applying `LIMIT`/`OFFSET` before that filter would page the
  unfiltered set and report a `total` that does not match the filtered result. The derivation and
  filter must move into the SQL predicate.
- **Acceptance Criteria**:
  - Cover status is derived in SQL using the existing latest-log-wins convention: the `coverLogs`
    row with the greatest `id` for that cover, not by timestamp.
  - `coverStatus=finished|in_progress|in_review` returns exactly the same enrollment set as the
    current implementation for the same data.
  - `coverStatus=none` returns exactly the enrollments having no cover, as it does today.
  - Omitting `coverStatus` returns all enrollments in scope, with `coverId` and `coverStatus`
    projected as they are today (nullable).
  - `meta.total` equals the number of enrollments matching both the scope filter and the
    `coverStatus` filter.
  - The response item shape, including `coverId` and `coverStatus`, is byte-for-byte unchanged.
- **Priority**: Must
- **Related Stories**: 005-cover-status-sql-pushdown

### FR-5: Score report status filter pushed down and answer fan-out scoped to the page

- **Description**: `buildScoreReports` in `src/service/score.ts` fetches every cover in scope, filters
  to `in_review`/`finished` in JavaScript, then loads every answer for every remaining cover. This is
  both the correctness blocker for `total` and the dominant memory cost. The status filter must move
  into SQL, and the answer fan-out must be scoped to the current page's cover IDs only.
- **Acceptance Criteria**:
  - Covers whose latest status is `in_progress` are excluded by the SQL predicate, not in JavaScript.
  - `meta.total` equals the number of `in_review` and `finished` covers in scope.
  - The answer query loads answers only for the cover IDs on the requested page.
  - Score values, category breakdown, and grade for any given cover are identical to the current
    implementation's output for the same data.
  - The finished-only grade rule established by intent `011-finished-cover-reward-guard` is
    preserved: `in_review` items carry `grade: null`.
  - Worst-case answer rows loaded per request is bounded by `limit × questions-per-cover`.
- **Priority**: Must
- **Related Stories**: 007-score-status-sql-pushdown, 008-page-scoped-answer-fanout

### FR-6: Existing filters, authorization, and scoping unchanged

- **Description**: This intent changes only how many rows a list returns and how they are wrapped.
  Every other aspect of the nine endpoints is preserved.
- **Acceptance Criteria**:
  - Factory lists keep required `validated` and optional `enrolled`, including the current
    `enrolled=false` behavior of disabling the fiscal-year enrollment-date filter.
  - Admin score list keeps optional `region` and `provinceId`.
  - Evaluator endpoints remain scoped to the caller's health region; Provincial endpoints remain
    scoped to the caller's province.
  - Role guards (`adminGuard`, `evalGuard`, `officerGuard`) are unchanged.
  - Fiscal-year scoping continues to use `utilities().getFiscalYear()`.
  - No endpoint is added, removed, or renamed; no database schema change is made.
- **Priority**: Must
- **Related Stories**: 004-factory-list-pagination, 006-enrollment-list-pagination, 009-score-list-pagination

### FR-7: Documentation and OpenAPI reflect the new contract

- **Description**: `docs/api-conventions.md` currently states "There is no pagination contract."
  That statement and the surrounding parameter/ordering sections become false when this intent ships
  and must be corrected in the same change.
- **Acceptance Criteria**:
  - The "no pagination contract" statement is replaced with the implemented contract: parameter
    names, defaults, maximum, 1-indexed page numbering, and the envelope shape.
  - The documented ordering list matches the total orders implemented under FR-3.
  - Each paginated route's OpenAPI `query` and `200` response schema reflect the new shapes.
  - The breaking change is called out explicitly for client owners.
- **Priority**: Must
- **Related Stories**: 010-pagination-contract-documentation

### FR-8: Pagination regression coverage

- **Description**: Automated tests protect the pagination contract at the service and route-schema
  seams, including the boundary conditions where offset pagination typically breaks.
- **Acceptance Criteria**:
  - Tests cover default parameters, explicit parameters, and out-of-range validation rejection.
  - Tests cover the last partial page, a page beyond the end, and an empty result set.
  - Tests assert `total` and `totalPages` correctness under an active filter, for both the
    `coverStatus` filter and the score status filter.
  - Tests assert page stability: iterating all pages over a fixed dataset yields every row once.
  - Tests cover score parity — paginated output matches pre-change output for the same data.
  - Tests cover all three roles for at least one resource family, to prove role parity.
- **Priority**: Must
- **Related Stories**: 011-pagination-regression-coverage

---

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Bounded list payload | Items returned per request | ≤ 100 |
| Bounded score fan-out | Answer rows loaded per score request | ≤ `limit` × questions-per-cover (≈ 4,100 at max limit) |
| Count cost | Count queries issued per list request | 1 |

### Scalability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Growth independence | Response size growth as factory/enroll/cover count grows | Constant (capped by `limit`) |
| Memory independence | Peak rows held in JavaScript per request | Independent of total dataset size |

### Compatibility

| Requirement | Metric | Target |
|-------------|--------|--------|
| Item contract stability | Item fields renamed, recased, or removed | 0 |
| Endpoint stability | Endpoints added, removed, or renamed | 0 |
| Filter behavior stability | Existing filters with changed semantics | 0 |
| Breaking surface | Endpoints whose `200` shape changes array → envelope | 9 (intentional, documented) |

### Consistency

| Requirement | Metric | Target |
|-------------|--------|--------|
| Cross-role contract parity | In-scope endpoints sharing one identical envelope and query contract | 100% |
| Standard conformance | Deviation from `standards/api-conventions.md` pagination section | 0 |

---

## Constraints

### Technical Constraints

**Project-wide standards**: loaded from `memory-bank/standards/` by the Construction Agent.

**Intent-specific constraints**:

- Pagination is offset-based, not cursor-based, per `standards/api-conventions.md`.
- The envelope is introduced *only* for the nine in-scope list endpoints. It is not a global
  response wrapper; `standards/api-conventions.md` states the project uses no envelope wrapper, and
  that remains true for every other route.
- Cover status must continue to be derived by greatest `coverLogs.id` (latest-log-wins), not by
  timestamp, matching intents `007` and `011`.
- No database schema change and no Drizzle migration. Index additions, if needed for the pushed-down
  filters, are a construction-time decision requiring human review.
- Preserve the `createXxxService(db)` factory plus singleton pattern and the `status(code, body)`
  return convention — services must not throw.
- Query parameters must round-trip through Elysia's query coercion; the shared schema must be
  composed into existing route query schemas rather than replacing them.

### Business Constraints

- Bulk/full-dataset export is deferred to a separate intent and must not be implemented here.
- The frontend cutover must be coordinated: all nine endpoints change response shape at once.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| The deferred export intent will serve the confirmed full-data need | If pagination ships first, the full-data consumer is truncated to 20 rows with no error until export lands | Resolved by design: a dedicated export API path replaces the full-data need. Residual risk is sequencing only — see the release-order open question below |
| The frontend can be updated in step with the API for all nine endpoints | Staff list views break on deploy | Clean break was chosen deliberately over opt-in wrapping; sequence the deploy with the frontend team |
| Page size 20/100 suits staff list UIs | Excessive round trips for users scanning long lists | `limit` is client-controlled up to 100; revisit the cap if usage shows otherwise |
| Pushing the cover-status and score-status filters into SQL reproduces the current JavaScript semantics exactly | Filtered lists silently change membership, altering what staff see | FR-4 and FR-5 require output-parity tests against the current implementation before the JavaScript path is removed |
| Existing indexes make the pushed-down filters acceptably fast | Pagination fixes memory but regresses latency | Measure the new queries during construction; index additions require human review per the technical constraints |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Should the envelope be a clean break or opt-in per request? | Product Owner | 2026-08-18 | Resolved: clean break — the envelope is unconditional |
| Default and maximum page size | Product Owner | 2026-08-18 | Resolved: default 20, maximum 100, minimum 1 |
| Which endpoints are in scope? | Product Owner | 2026-08-18 | Resolved: all nine staff list endpoints |
| Does a consumer need the full unpaged dataset? | Product Owner | 2026-08-18 | Resolved: yes, and it will be served by a dedicated export API path in its own intent, not by an escape hatch here |
| Release order — does export ship before, with, or after pagination? | Product Owner | TBD | Pending. Shipping pagination first opens a gap in which the full-data consumer is broken and its replacement does not yet exist |
| Does the gap, if any, fall inside fiscal year-end reporting (year ends 30 September)? | Product Owner | TBD | Pending |
| Which resources need export, and in what format? | Product Owner | TBD | Deferred to the export intent |
| Do the pushed-down filters need new indexes? | Construction | TBD | Pending — measure during construction |
