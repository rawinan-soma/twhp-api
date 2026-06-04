# API Conventions

## Overview

REST API under `/twhp/api` prefix. No versioning. Elysia status responses with no envelope wrapper. Offset-based pagination.

## API Style

**Style**: REST
**Base Prefix**: `/twhp/api`
**Docs**: `/twhp/api/document` (OpenAPI via Elysia Swagger)

Route definitions include TypeBox validation and OpenAPI detail inline in the route file. No separate controller layer.

## API Versioning

**Strategy**: None

No version segment in the URL (no `/v1`). Breaking changes are managed at the deployment level.

## Response Format

**Pattern**: Direct `status(code, body)` — no envelope wrapper

Services return `status(code, body)` (`ElysiaCustomStatusResponse`). Routes return these directly without wrapping in a `{ data, meta }` envelope.

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

**Strategy**: Offset-based

```
GET /twhp/api/resource?page=1&limit=20
```

Response includes the paginated items. Page numbering starts at 1. Limit defaults to be defined per-endpoint.
