# API Conventions

## Overview

REST API under `/twhp/api` prefix. No versioning. Elysia status responses with no envelope wrapper, except the nine paginated staff list endpoints, which return `{ items, meta }` (ADR-0007). Offset-based pagination.

## API Style

**Style**: REST
**Base Prefix**: `/twhp/api`
**Docs**: `/twhp/api/document` (OpenAPI via Elysia Swagger)

Route definitions include TypeBox validation and OpenAPI detail inline in the route file. No separate controller layer.

## API Versioning

**Strategy**: None

No version segment in the URL (no `/v1`). Breaking changes are managed at the deployment level.

## Response Format

**Pattern**: Direct `status(code, body)` — no envelope wrapper, with one enumerated exception

Services return `status(code, body)` (`ElysiaCustomStatusResponse`). Routes return these directly without wrapping in a `{ data, meta }` envelope.

**Exception (ADR-0007)**: the nine staff list endpoints — `GET /{admins,evaluators,provincialOfficers}/{factories,enrolls,score}` — return `{ items, meta }`, because offset pagination cannot work without returning `total`. The rule governing the exception: an endpoint gets the envelope **if and only if its result set grows with the data**. Bounded collections (the question set, per-cover answers, location lookups) stay bare. Error responses on those nine routes are **not** wrapped — a `404` keeps its bare `{ message }` body.

```ts
// Service
return status(200, { id: factory.id, name: factory.name });

// Route
const result = await factoryService.getFactory(id);
return result;
```

## Error Response Format

**Pattern**: HTTP status code + Elysia default error body

| Status | Trigger |
|---|---|
| 400 | Validation / parse / invalid file type errors |
| 401 | Auth failure (missing or invalid JWT) |
| 404 | Resource not found |
| 500 | Unexpected server errors |

Error classification is centralized in the global `onError` handler in `src/index.ts`. Services signal errors via `status(code, body)` — never by throwing.

## Pagination

**Strategy**: Offset-based (ADR-0009)

```
GET /twhp/api/resource?page=1&limit=20
```

**Scope**: the nine staff list endpoints only. No other route accepts `page` or `limit`.

| Parameter | Default | Range |
|-----------|---------|-------|
| `page` | 1 | `>= 1`, 1-indexed |
| `limit` | 20 | `1..100` |

The defaults and the ceiling are **uniform across all nine**, declared once in `src/schema/pagination.ts` (`PAGE_DEFAULT`, `LIMIT_DEFAULT`, `LIMIT_MAX`) and composed into each route's query schema — they are not per-endpoint. Out-of-range values are rejected with 400 before any query runs; the `limit` ceiling is a resource-exhaustion control.

Response envelope:

```ts
{ items: T[], meta: { page, limit, total, totalPages } }
```

`total` counts rows matching the complete filter predicate; `totalPages` is `ceil(total / limit)`, and `0` when `total` is `0`. A page past the end returns 200 with empty `items` and accurate `meta`.

**Every paginated query must impose a total order** — an ordering whose final sort column is unique — or `OFFSET` has no defined meaning and rows can repeat or vanish between pages.

No cursor pagination, no `hasNext`/`hasPrev`, no client-selected sorting.

## Fiscal-year addressing

Thirteen read endpoints accept an optional `fiscalYear` query parameter — the nine staff lists plus the four Factory self-reads.

| Parameter | Default | Range |
|-----------|---------|-------|
| `fiscalYear` | current fiscal year | `2000..2100`, integer |

The bounds are declared once in `src/schema/fiscal-year.ts` (`FISCAL_YEAR_MIN`, `FISCAL_YEAR_MAX`) and composed into each route's query schema alongside `PaginationQuery` — they are not per-endpoint. `src/utils.ts` imports the same constants, so validation and resolution cannot drift; divergence would turn a 400 into a 500.

**Common Era, labelled by the ending year.** `2026` means 1 October 2025 through 30 September 2026. Buddhist Era is a client presentation concern (`fiscalYear + 543`); no BE value crosses the API.

**Omitting the parameter selects the current fiscal year**, so pre-existing callers are unaffected. A valid year holding no data returns an empty page or the endpoint's existing not-found shape — never an error implying the year is invalid.

Fiscal-year windows are resolved only by `utilities().getFiscalYear()`, which pins the boundary to a fixed UTC+7 offset rather than inheriting the host timezone. **No service constructs fiscal-year boundaries itself.**

Addressing applies to **reads only**. Every write path remains scoped to the current fiscal year.

Responses carry the resolved `fiscalYear`, taken from the year the query was scoped to rather than derived per row. Exception: the Factory list with `enrolled=false` disables fiscal-year filtering, so those rows may span years and the field is omitted.

## Fiscal-year write authority

**Writes are current-fiscal-year only**, with two exceptions:

| Actor | Closed-year writes |
|-------|--------------------|
| `Role.DOED`, and `Role.Evaluator` at level `ODPC` | permitted, region-scoped, **no expiry** |
| Factory | permitted for **31 days** after the boundary, Cover completion only |
| All others | refused |

An evaluator write reads its target year from the Cover's Enrollment — **a request never nominates its own year.** A Factory write may name a year, because `factoryId` comes from the JWT subject and the query is already confined to the caller's own records; naming a year selects among its own Covers.

The grace window is defined relative to the rollover boundary, not as calendar dates, so it recurs each year. Only the immediately preceding fiscal year is admitted. `POST /assessments/covers` and both `/factories/enrolls` write paths are excluded — grace completes an assessment, it does not start one or reopen enrollment.

Ordering is a disclosure decision: the region check runs before the year check, so an out-of-region caller receives the existing 404 and never learns a Cover exists in a given year.

**Expiry mutates nothing.** A Cover unfinished at window close stays `in_progress` permanently. No sweep, no job, no persisted marker, no terminal status.

**Known limitation:** grace-window Factory writes are not attributable in the database. `CoverLogs.evaluator_id` is an evaluator reference and a Factory is not an evaluator; per-actor attribution would require a schema change.
