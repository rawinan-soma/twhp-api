# Coding Standards

## Overview

TypeScript codebase using Biome for unified formatting and linting. Layer-based domain structure with strict error-return (not throw) patterns and structured logging via elysia-logger.

## Code Formatting

**Tool**: Biome
**Config**: `biome.json` at project root

Biome handles both formatting and linting in a single tool — consistent with Bun's philosophy of fast, integrated tooling. No Prettier or ESLint needed.

## Linting

**Tool**: Biome
**Strictness**: Balanced (Biome recommended ruleset)

No ad-hoc `console.log` for error handling — rely on the global `onError` + `onAfterResponse` flow in `src/index.ts`.

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Variables / functions | camelCase | `getUserById`, `jwtPayload` |
| Service factories | `createXxxService` / `xxxService` | `createFactoryService`, `factoryService` |
| Classes / Types / Interfaces | PascalCase | `ElysiaCustomStatusResponse` |
| Enum values | camelCase | `standardHC`, `standardISO45001` |
| Route files | kebab-case folder + `index.ts` | `src/routes/factories/assessments/index.ts` |
| Service files | camelCase `.ts` | `src/service/factory.ts` |
| Schema base types | `BaseXxxSelect/Insert/Update` | `BaseFactorySelect` |
| Boolean variables | `is` / `has` / `can` prefix | `isActive`, `hasPermission` |

**File Naming**:
- Routes: `src/routes/<domain>/**/index.ts`
- Services: `src/service/<domain>.ts`
- Schemas: `src/schema/<domain>.ts`
- Middleware: `src/middleware/<name>.ts`

## File Organization

**Pattern**: Layer-based domain structure

```text
src/
  routes/<domain>/**/index.ts   → ElysiaJS route definitions (guards + endpoints + OpenAPI)
  service/<domain>.ts           → Business logic singletons (factory-function pattern)
  schema/<domain>.ts            → TypeBox DTOs (extend from drizzle-typebox base types)
  middleware/                   → jwt.ts, rbac.ts, guards.ts
  drizzle/
    schema.ts                   → Single-file Drizzle schema (source of truth)
    index.ts                    → DB client export
  queue/                        → BullMQ queue definitions
  worker/                       → BullMQ worker handlers
  workers.ts                    → Worker entrypoint + repeatable job registration
  config.ts                     → Env validation (single source of truth — never use Bun.env directly)
  utils.ts                      → Shared utilities (getFiscalYear, uploadFile, etc.)
  index.ts                      → App entrypoint + global error handler
```

**Conventions**:
- No `src/controller/` folder — routes ARE the controller layer
- No manual route registration — `elysia-autoload` handles it
- Types co-located with their schema files

## Testing Strategy

**Framework**: Not defined — no test suite currently (`package.json` test → exit 1).

Testing strategy to be established when the first test suite is introduced.

## Error Handling

**Pattern**: Return errors, never throw

Services return `status(code, body)` (`ElysiaCustomStatusResponse`) — never throw from service layer. Routes check the response and return directly.

**Global Error Handler** (`src/index.ts`):
- `VALIDATION` / `INVALID_FILE_TYPE` / `PARSE` → 400
- `NOT_FOUND` → 404
- Unexpected → 500 (logged as error)
- `onAfterResponse` logs any 4xx not already caught by `onError`

**API Error Format**: Elysia status response with HTTP status code + body.

## Logging

**Tool**: `@bogeychan/elysia-logger`
**Format**: Structured (pino-pretty in dev, JSON in production)
**Timestamp**: Bangkok timezone (custom formatter)

**Levels**:

| Level | Usage |
|---|---|
| error | Unexpected failures → 500 responses |
| warn | Expected but notable (4xx responses via onAfterResponse) |
| info | Request lifecycle, significant business events |
| debug | Dev-only detailed traces |

**Rules**:
- Always log: API requests (method, path, status, duration), auth events, errors with context
- Never log: passwords, JWT tokens, raw cookie values, PII
- Never add ad-hoc `console.log` for error handling — use the onError/onAfterResponse pipeline
- Health check endpoint (`/twhp/api/health`) excluded from request logs
