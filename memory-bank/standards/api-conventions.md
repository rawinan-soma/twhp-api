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
