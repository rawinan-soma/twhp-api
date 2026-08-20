---
unit: 001-list-pagination
bolt: 025-list-pagination
stage: design
status: complete
updated: 2026-08-19T12:05:41Z
---

# Technical Design - List Pagination (Foundation + Factory Lists)

## Architecture Pattern

**Pattern**: Shared value-object module + repository-contract change. No new layer.

The domain model found that this context has no entities and no events — only value objects and pure
functions. That shape argues directly against introducing a hexagonal port, a use-case class, or a
`src/pagination/` tree. The correct implementation is one small module in the existing schema layer
plus disciplined changes inside existing service functions.

The project's established layering is retained exactly:

- `src/schema/<domain>.ts` — TypeBox DTOs, composed from drizzle-typebox base types
- `src/service/<domain>.ts` — business logic, `createXxxService(db)` factory plus singleton
- `src/routes/<domain>/**/index.ts` — Elysia route definitions, guards, OpenAPI detail

Pagination adds one file to the schema layer and modifies three functions in one service and three
route files. Nothing else moves.

**Rejected alternative**: a generic `paginate()` wrapper that accepts a Drizzle query builder and
applies `limit`/`offset` generically. Rejected because it cannot enforce INV-3 — it sees only the
page query, never the count query, so it cannot guarantee the two share a predicate. The invariant
most likely to break is precisely the one that abstraction would hide.

## Layer Structure

```text
┌─────────────────────────────────────────────────────────┐
│  Presentation   src/routes/{admins,evaluators,           │
│                 provincialOfficers}/factories/index.ts   │
│                 • compose PaginationQuery into query     │
│                 • declare Paginated(item) as 200 schema  │
│                 • guards unchanged                       │
├─────────────────────────────────────────────────────────┤
│  Application    src/service/factory.ts                   │
│                 • resolvePage() → effective Page Request │
│                 • one shared predicate builder           │
│                 • count + fetch, then buildPage()        │
├─────────────────────────────────────────────────────────┤
│  Domain         src/schema/pagination.ts                 │
│                 • PaginationQuery, PaginationMeta        │
│                 • Paginated<T>()                         │
│                 • resolvePage(), buildPage()             │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Drizzle / PostgreSQL                     │
│                 • no schema change, no migration         │
└─────────────────────────────────────────────────────────┘
```

## Module Design: `src/schema/pagination.ts`

One new file. It holds both the TypeBox schemas and the two pure functions, because the coding
standard states types are co-located with their schema files and the functions are the behavioural
counterpart of the schemas. Splitting thirty lines across two files would add an import hop and no
clarity.

### Exports

| Export | Kind | Purpose |
|--------|------|---------|
| `PaginationQuery` | TypeBox object | `page` and `limit` with bounds and defaults. Composed into route query schemas. |
| `PaginationQueryDto` | Type | `Static<typeof PaginationQuery>` |
| `PaginationMeta` | TypeBox object | `page`, `limit`, `total`, `totalPages` — all non-negative integers |
| `Paginated<T>(item)` | Generic factory | Returns `t.Object({ items: t.Array(item), meta: PaginationMeta })` |
| `resolvePage(query)` | Pure function | Page Resolver. Normalizes possibly-undefined input to an effective `{ page, limit, offset }` |
| `buildPage(items, total, page, limit)` | Pure function | Page Assembler. Sole owner of the `totalPages` calculation |

### Contract detail

- `page`: integer, `minimum: 1`, `default: 1`
- `limit`: integer, `minimum: 1`, `maximum: 100`, `default: 20`
- `offset` is computed by `resolvePage` as `(page - 1) * limit` and never appears in any public
  schema
- `buildPage` computes `totalPages = total === 0 ? 0 : Math.ceil(total / limit)`
- `PaginationMeta` field names are camelCase on every endpoint, including the snake_case Factory
  lists

### Defence in depth on defaults

Bounds and defaults are declared in `PaginationQuery` so that invalid values are rejected before any
query executes, and so that OpenAPI documents them. `resolvePage` independently tolerates `undefined`
and re-applies the same defaults.

This duplication is intentional. Whether Elysia's TypeBox integration materializes a `default` for an
absent query parameter is a version-dependent behaviour, and correctness must not rest on it.
**Stage 4 must verify empirically which layer actually supplies the default**, and Stage 5 must test
the omitted-parameter case explicitly. If the schema does supply it, `resolvePage` is a harmless
no-op; if it does not, `resolvePage` is what makes the contract hold.

## API Design

Three endpoints change. Guards, filters, and item projections are untouched.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/twhp/api/admins/factories` | GET | `validated: boolean` (required), `enrolled?: boolean`, `page?: number`, `limit?: number` | `200 Paginated(AdminFactoryItem)` |
| `/twhp/api/evaluators/factories` | GET | `validated: boolean` (required), `enrolled?: boolean`, `page?: number`, `limit?: number` | `200 Paginated(FactoryItem)`, `404 { message }` |
| `/twhp/api/provincialOfficers/factories` | GET | `validated: boolean` (required), `enrolled?: boolean`, `page?: number`, `limit?: number` | `200 Paginated(FactoryItem)`, `404 { message }` |

### Query composition

Each route composes rather than replaces, so existing filters keep their declarations and their
OpenAPI documentation:

```text
query: t.Composite([
  t.Object({ validated: t.Boolean(), enrolled: t.Optional(t.Boolean()) }),
  PaginationQuery,
])
```

### Response body

```json
{
  "items": [ { "account_id": 1, "name_th": "…", "is_validate": true, "…": "…" } ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 }
}
```

The Admin variant's item retains its extra `username` field; the Evaluator and Provincial variants
retain their shape. Item schemas are extracted to named constants so the three routes stop repeating
a sixteen-field inline object, but not one field name or type changes.

### Non-200 responses

`404 invalid evaluator` and `404 provincial officer not found` are returned unwrapped, exactly as
today. Only the `200` body gains the envelope.

## Data Persistence

**No schema change. No Drizzle migration. No new table, column, or index in this bolt.**

### Query shape per endpoint

Each of the three service functions becomes a pair sharing one predicate:

```text
buildFactoryPredicate(scope, filters) ──┬──► count query  ──► total
                                        └──► page query   ──► items
                                             + ORDER BY factories.accountId ASC
                                             + LIMIT limit OFFSET offset
```

The predicate builder is a private function inside `createFactoryService`. Both queries call it. They
may not maintain two parallel `WHERE` clauses — this is the implementation of repository contract
obligation 1 and the only structural defence of INV-3.

### Ordering

`factories.accountId` ascending, unchanged from today. It is the accounts primary key and therefore
unique, so it already satisfies the Total Order Key invariant. No tiebreaker is needed for this
family. The Enrollment and Score Report families do need one; that work belongs to bolts 026 and 027
under the same story 003.

### ⚠ Design finding: the Enrollment join multiplies rows

This is the most significant finding of the design stage and it requires a decision before Stage 4.

All three Factory list queries join `enrolls` to support the `enrolled` filter. The Admin variant uses
a left join; the region and province variants use inner joins. The fiscal-year date predicate is
applied **only when `enrolled` is true**.

Consequence: when `enrolled` is false or omitted on the Admin endpoint, nothing constrains the join to
one Enrollment row. A Factory with three Enrollments across three fiscal years produces **three
identical rows**.

Today this is a latent cosmetic defect — a duplicated entry in a long unpaginated list. Under
pagination it becomes a correctness failure:

1. `count(*)` counts join rows, not Factories, so `total` overstates the result set.
2. `items.length` counts join rows, so a page of twenty may contain fewer than twenty distinct
   Factories — violating the caller's expectation and arguably INV-1's intent.
3. The same Factory can straddle a page boundary and appear on two consecutive pages, violating Page
   Stability even though `accountId` is unique.

Three options were considered:

1 - **Replace the join with an `EXISTS` subquery for the `enrolled` filter.** The Factory row is
    never multiplied, `count` is exact, ordering by `accountId` is genuinely total, and the filter's
    meaning is preserved. Cost: it silently removes duplicate rows that callers see today, which is a
    visible behaviour change even though it is a repair.

2 - **Keep the join and count with `COUNT(DISTINCT factories.accountId)`, adding `DISTINCT` to the
    page query.** Fixes the count and the duplicates, but `DISTINCT` over a sixteen-column projection
    is fragile and can regress performance.

3 - **Change nothing and accept duplicates.** Cheapest, and strictly honours "no behaviour change" —
    but knowingly ships a paginated endpoint whose `total` is wrong. Rejected as indefensible.

**Recommendation: option 1.** It is the only choice that makes `total` correct without introducing a
`DISTINCT` over a wide projection.

**This is an ADR candidate and is deferred to Stage 3 for an explicit decision**, because it is a
deliberate deviation from FR-6's "existing filters behave identically" and the human must own that
call. It is recorded here so the decision is made with evidence rather than discovered during
implementation.

Note this does **not** touch the separate, known oddity that `enrolled=false` disables the
fiscal-year filter rather than selecting unenrolled Factories. That semantic is preserved verbatim;
the intent explicitly excludes repairing it.

## Security Design

| Concern | Approach |
|---------|----------|
| Authentication | Unchanged. Cookie JWT via the existing `jwtPlugin`. |
| Authorization | Unchanged. `adminGuard`, `evalGuard`, `officerGuard` remain the first plugin in each group. |
| Scope enforcement | **Scope is a predicate, never a pagination concern.** Region and province filters stay inside `buildFactoryPredicate` and are therefore applied to the count query and the page query alike. A caller cannot reach another region's rows by manipulating `page` or `limit`. |
| Resource exhaustion | `limit` is capped at 100 by schema validation, rejecting a request before any query runs. This is a security control, not only a performance one: it removes the ability to force an unbounded read. |
| Enumeration | Pagination exposes `total`, revealing the size of a role's own scoped result set. This is information the role is already entitled to read in full and is not a new disclosure. |
| Data encryption | Unchanged. Not in scope. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| Bounded payload (≤ 100 items) | `maximum: 100` on `limit` in `PaginationQuery`, enforced at validation before query execution |
| Bounded memory | `LIMIT`/`OFFSET` in SQL. The service never materializes more than `limit` rows. |
| One count query per request | Exactly two queries per list request: one `count`, one page fetch. No N+1; the Factory projection needs no per-row follow-up. |
| Growth independence | Response size is a function of `limit` only, never of table size |
| Page stability | Total order on the unique `accountId`, subject to the join-multiplication decision above |
| Item contract stability | Item schemas extracted to named constants and reused verbatim; no field renamed, recased, or removed |
| Latency | Ordering and filtering columns are unchanged from today, so existing index usage is unchanged. `EXPLAIN ANALYZE` before and after is required in Stage 5; any index need is raised for human review, never migrated inside a bolt. |

## Error Handling

No new error path is introduced. The existing return-not-throw convention is preserved throughout.

| Error Type | Code | Response |
|------------|------|----------|
| `page` or `limit` out of bounds or non-numeric | 400 | Existing global `onError` maps `VALIDATION` → 400. No service code involved. |
| Evaluator account resolves no region | 404 | `{ message: "invalid evaluator" }`, unwrapped, unchanged |
| Provincial officer not found | 404 | `{ message }`, unwrapped, unchanged |
| Page beyond the last page | **200** | `{ items: [], meta: { …, total, totalPages } }` — a valid empty page, never 404 (INV-4) |
| Unexpected failure | 500 | Existing global handler, unchanged |

Services continue to return `status(code, body)` and never throw. `resolvePage` and `buildPage` are
total functions over already-validated input and have no failure mode of their own.

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|-------------|
| PostgreSQL | Filter, count, order, and slice | Drizzle ORM. `count()` from `drizzle-orm`. No new dependency. |
| Frontend client | Consumes the envelope | REST. Breaking change; requires the coordinated release recorded in the intent. |

**No package is added.** `count` is already exported by the installed `drizzle-orm`, and TypeBox
composition uses `t.Composite`, already used elsewhere in the codebase.

## Files Changed

| File | Change |
|------|--------|
| `src/schema/pagination.ts` | **New.** Schemas plus `resolvePage` and `buildPage`. |
| `src/service/factory.ts` | `buildFactoryPredicate` extracted; `getAllFactories`, `getAllFactoriesByRegion`, `getAllFactoriesByProvinceId` each become count + fetch + `buildPage`. |
| `src/schema/factory.ts` | Item schemas extracted as named constants for reuse by the three routes. |
| `src/routes/admins/factories/index.ts` | Compose `PaginationQuery`; response becomes `Paginated(item)`. |
| `src/routes/evaluators/factories/index.ts` | Same. |
| `src/routes/provincialOfficers/factories/index.ts` | Same. |

Six files: one new, five modified. No route added, removed, or renamed.

## Open Decisions Carried to Stage 3

1 - **The Enrollment join multiplication.** Recommended fix is the `EXISTS` rewrite. It is a
    deliberate, visible deviation from FR-6 and needs an explicit human decision plus an ADR.

2 - **The envelope as a scoped exception to the no-wrapper convention.** `memory-bank/standards/api-conventions.md`
    states this API uses no envelope wrapper. Nine endpoints will now use one. Bolt 025's plan already
    flags this as likely ADR-worthy; the decision belongs to Stage 3.

## Verification Obligations Handed to Stages 4 and 5

- Confirm empirically whether Elysia materializes TypeBox `default` values for absent query
  parameters, and record the finding.
- Test the omitted-parameter, last-partial-page, beyond-the-end, and empty-set cases.
- Prove `total` counts distinct Factories, not join rows, under whichever option Stage 3 selects.
- Run `EXPLAIN ANALYZE` on the count and page queries and compare against the current query.
