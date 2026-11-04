# System Architecture

## Overview

Layered domain-organized monolith on Bun + ElysiaJS. Routes, services, and schemas are separated by layer but grouped by domain. Background jobs run as a separate process sharing the same codebase.

## Architecture Style

**Layered Monolith (domain-organized)**

```text
Request → Route layer (src/routes/<domain>/)
        → Service layer (src/service/<domain>.ts)
        → Data layer (Drizzle ORM → PostgreSQL)

Background → BullMQ Worker (src/workers.ts, separate process)
           → Redis (queue backend)
           → Service layer (shared)

Files → MinIO (object storage, outside DB transactions)
```

No microservices. Domains share the same DB connection and codebase. The worker process is isolated at the entrypoint level only.

## API Design

**Style**: REST
**Base Prefix**: `/twhp/api`
**Docs**: OpenAPI auto-generated at `/twhp/api/document` (Elysia Swagger plugin)

Routes are file-based via `elysia-autoload` — the folder structure under `src/routes/` directly maps to the API surface. Nested folders become nested path segments.

## State Management

**Stateless**

No server-side session store. Auth state is carried entirely in signed cookies:
- `Authentication` — short-lived access token (JWT)
- `Refresh` — longer-lived refresh token (JWT)

Token verification and auto-rotation handled in `src/middleware/jwt.ts`. RBAC roles are embedded in the JWT payload.

## Caching Strategy

**No HTTP cache layer**

Redis is present but used exclusively as the BullMQ job queue backend — not for response or query caching. If caching is added in future, Redis is the available infrastructure.

## Security Patterns

- **Authentication**: Cookie-based JWT, auto-rotation on refresh token use
- **Authorization**: RBAC via pre-composed guards — use `adminGuard`, `factoryGuard`, `evalGuard`, `officerGuard` in routes; never compose `jwtPlugin + requireRoles` manually
- **Input Validation**: TypeBox schemas at route layer — all input validated before reaching service layer
- **Config Safety**: All env vars validated at startup in `src/config.ts`; never access `Bun.env` directly outside config
- **File Safety**: File I/O always outside DB transactions — upload to MinIO first, then persist URL in transaction
