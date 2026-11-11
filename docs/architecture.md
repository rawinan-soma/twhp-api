# Architecture

This backend serves the Total Worker Health Promotion (TWHP) system, verified on 2026-09-02 on branch `dev` and re-checked on 2026-11-11 at `f194141` (the head of `main`, `staging`, and `dev`). It is a Bun/TypeScript application with two executable processes:

- an Elysia HTTP API for authentication, enrollment, factory assessments, scoring, review, administration, locations, and file access;
- a BullMQ worker for transactional and scheduled email.

PostgreSQL is the durable system of record. Redis holds queue data and temporary authentication state. An S3-compatible object store holds uploaded evidence and certificate files; PostgreSQL stores their filenames. Since 2026-11-09 Compose runs RustFS for that store. The Compose service is still named `minio`, the code still uses the `minio` npm client, and the configuration keys keep their `MINIO_*` names (see [MinIO to RustFS migration](minio-to-rustfs-migration.md)). "MinIO" below means that store.

For code navigation, see [Project structure](project-structure.md). For behavior and data details, see [Domain model](domain-model.md), [Business rules](business-rules.md), [Database](database.md), and [Authentication and authorization](authentication-authorization.md).

## System at a glance

```mermaid
flowchart LR
    Client[Web client] --> Nginx[Nginx reverse proxy]
    Nginx --> API[Elysia API<br/>src/index.ts]
    API --> PG[(PostgreSQL)]
    API --> Redis[(Redis)]
    API --> MinIO[(Object storage<br/>RustFS, service minio)]
    API --> Queue[BullMQ email queue]
    Queue --> Worker[Email worker<br/>src/workers.ts]
    Worker --> SMTP[SMTP provider]
    Worker --> PG
```

| Concern | Implementation | Authoritative source |
|---|---|---|
| Runtime and package manager | Bun with strict TypeScript | `package.json`, `bun.lock`, `tsconfig.json` |
| HTTP framework | Elysia with filesystem autoload | `src/index.ts`, `src/routes/` |
| Validation and OpenAPI | Elysia TypeBox and `@elysiajs/openapi` | `src/schema/`, route files |
| Persistence | Drizzle ORM with PostgreSQL | `src/drizzle/index.ts`, `src/drizzle/schema.ts` |
| Authentication | Cookie JWT, refresh rotation, staff email OTP | `src/middleware/jwt.ts`, `src/service/authentication.ts` |
| Authorization | Role-specific Elysia guards | `src/middleware/rbac.ts`, `src/middleware/guards.ts` |
| Object storage | S3-compatible store (RustFS in Compose) through the `minio` client | `src/utils.ts`, `docker-compose.yaml` |
| Jobs and temporary state | BullMQ and Redis | `src/queue/email.ts`, `src/workers.ts` |
| Email | Nodemailer in a separate worker | `src/worker/email.ts` |
| Logging | `@bogeychan/elysia-logger`; console logging remains in worker/utilities | `src/index.ts`, `src/worker/email.ts` |

The checkout lockfile fixes current dependency resolution. The exact production Bun runtime is **Unknown / Requires Organizational Knowledge**: Docker uses the floating `oven/bun:1` family, while `elysia` and `bun-types` are declared as `latest`.

## Process composition

### API process

`src/index.ts` is the API composition root used by `bun run dev`, `bun run start`, Docker Compose, and the release image. Startup proceeds as follows:

1. Import `src/config.ts`, which eagerly validates configuration.
2. Create the structured logger.
3. Create `new Elysia({ prefix: "/twhp/api" })`.
4. Mount OpenAPI at `/twhp/api/document`.
5. Install request logging and global error hooks.
6. Autoload `src/routes/`, ignoring test/spec files.
7. Listen on `APP_PORT` with a 130 MB request-body limit.

`src/routes/index.ts` supplies `/twhp/api/health`. This is a liveness response only: it returns a constant string and does not check PostgreSQL, Redis, MinIO, SMTP, or the worker.

The release image deliberately runs the API from TypeScript source. `elysia-autoload` needs the route filesystem at runtime, so `Dockerfile` copies `src/` rather than compiling the API into a standalone binary.

### Worker process

`src/workers.ts` is the worker composition root used by `bun run worker`. Importing `src/worker/email.ts` creates the BullMQ worker as a module side effect. The process consumes these `email` queue job names:

- `password-reset-request`
- `invitation`
- `factory-validation-reminder`
- `2fa-otp`
- `verdict-result-finished`
- `verdict-result-in-progress`

The bootstrap also installs `factory-validation-reminder` through `upsertJobScheduler` with pattern `30 8 * * 1-5` and `tz: "Asia/Bangkok"`, both declared in `src/queue/schedule.ts`. The reminder runs at 08:30 Bangkok time on weekdays only, and the timezone no longer depends on the worker process environment. Before installing the scheduler, the bootstrap removes any legacy repeatable entry of the same name, because an older daily entry would otherwise keep firing on weekends.

Worker replica count, repeat-job ownership, job replay, delivery monitoring, and dead-letter procedures are **Unknown / Requires Organizational Knowledge**.

## Module organization and dependency direction

The intended per-domain flow is:

```text
route + TypeBox contract
        -> domain service
        -> Drizzle tables/PostgreSQL
```

Routes under `src/routes/` are HTTP adapters. They attach guards, declare request/response schemas, call service singletons, and pass service results back to Elysia. DTOs live under `src/schema/`. Business workflows and Drizzle queries live together under `src/service/`.

Most database services expose a factory and a production singleton:

```ts
export const createXxxService = (database: typeof db) => ({ /* ... */ });
export const xxxService = createXxxService(db);
```

This is a useful database seam, but it is **not full dependency injection**. Do not assume `createXxxService(testDb)` isolates the complete module:

- `createAuthenticationUsecase(database)` still uses global `redisConnector`, `emailQueue`, and `env`.
- `createEvaluatorReviewService(database)` still uses global `emailQueue`, MinIO utilities, and the production `evaluatorService` and `provincialOfficerService` singletons when resolving reviewers.
- `createInvitationService(database)` still uses the global `emailQueue` to send Invitation links.
- answer, enrollment, and file services use process-global MinIO helpers; cover, factory, and score use the fiscal-year helper exported by the same overloaded global utilities module.

Services also return Elysia `status(...)` objects, and routes detect `ElysiaCustomStatusResponse`. The business layer is therefore coupled to the HTTP framework. `src/service/scoreHelpers.ts` and `src/service/answerFileRules.ts` are the notable pure modules: scoring/grade computation and per-choice evidence rules, with no Elysia or infrastructure imports. `src/schema/pagination.ts` and `src/service/coverStatus.ts` are similarly narrow shared contracts, as are `src/service/awardHistory.ts` (the one reader of `Awards` for "held gold in fiscal year Y", ADR-0014) and `src/service/factoryNameSearch.ts` (the one Factory Name Search predicate, used by the nine staff lists).

For known maintainability consequences, see [Technical debt](technical-debt.md).

## Request lifecycle

A typical guarded request follows this path:

1. Nginx proxies `/twhp/api/` to the API in container deployments.
2. Elysia logging captures request metadata.
3. Filesystem routing and TypeBox validation select and validate the handler.
4. `jwtPlugin` verifies the `Authentication` cookie. If necessary, it uses the `Refresh` cookie to rotate tokens, update cookies, and possibly update the persisted refresh-token hash.
5. `requireRoles` or a precomposed guard checks the JWT role.
6. The route calls one or more service singletons.
7. The service queries PostgreSQL and may use Redis, BullMQ, or MinIO.
8. Elysia validates/serializes the response. Global hooks normalize and log framework errors or log custom 4xx responses.

Refresh rotation is write-capable middleware: an otherwise read-only endpoint may update authentication cookies and account refresh-token state.

The precomposed guards in `src/middleware/guards.ts` are:

| Guard | Allowed role |
|---|---|
| `adminGuard` | `DOED` |
| `factoryGuard` | `Factory` |
| `evalGuard` | `Evaluator` |
| `officerGuard` | `Provincial` |

Each guard is lifted with `.as("scoped")`, and `requireRoles` derives with `as: "scoped"`, so the role check applies to the route that mounts the guard and not to its siblings. Both are required. Before 2026-11-09 (#41) the role check did not reach guarded routes, so any valid session passed all four guards. `src/middleware/guards.test.ts` now sends every autoloaded route an anonymous request and one request per role, and checks each result against an access table. A route with no entry in that table fails the test.

See [API conventions](api-conventions.md) for route and response conventions and [Authentication and authorization](authentication-authorization.md) for token, OTP, and role behavior.

## State and consistency boundaries

### PostgreSQL state

`src/drizzle/schema.ts` declares all tables and enums. Services query these declarations directly; there is no separate repository layer.

Current cover and answer state follows a load-bearing latest-log-wins convention:

- cover state comes from the latest `coverLogs` row;
- answer state comes from the latest `answerLogs` row;
- missing logs receive workflow-specific default states.

Cover status resolution was consolidated into `src/service/coverStatus.ts` during intent 012. It exports two shapes of the same rule — `latestCoverLogLateral(db)` for a `LEFT JOIN LATERAL` in a list or count query, and a standalone read for one already-known Cover — and every query that filters, counts, or paginates on Cover status must import from it. Writing a second correlated subquery over `coverLogs` is a review failure; see [ADR-0010](adr/0010-lateral-latest-cover-log-resolution.md) and [ADR-0008](adr/0008-exists-subquery-for-enrolled-filter.md), which removed a row-multiplication defect from the factory lists.

Answer state resolution is **not** consolidated. Changes to answer log ordering or defaults must still be checked across `answer.ts`, `score.ts`, and `evaluator-review.ts`. Per-choice evidence requirements live in `src/service/answerFileRules.ts`.

Scores are derived on demand. The Grade is stored in `Awards` at finalize and never recomputed. A DOED approval of a Factory can also write `Awards` rows for Prior Awards, in the same transaction as the approval. See [Business rules](business-rules.md) and ADR [0001](adr/0001-score-calculated-on-demand.md).

### PostgreSQL and MinIO

MinIO operations intentionally occur outside database transactions. This avoids holding a database connection during file I/O, but the systems are not atomic:

- an upload can succeed before a later database write fails, leaving an orphan object;
- replacement code can delete an old object before replacement upload/database update succeeds;
- non-strict deletion can fail while database work continues;
- strict multi-file deletion can partially succeed before another deletion aborts finalization.

Treat compensation and reconciliation as part of every file-changing workflow. See [Troubleshooting](troubleshooting.md) for operational recovery guidance.

### PostgreSQL, Redis, and email jobs

Queue publication is not transactional with PostgreSQL or Redis state:

- evaluator finalization commits before it publishes a result email, and enqueue failure is logged without rolling back finalization;
- OTP challenge keys are written before the email job is published, so challenge state can exist without successful delivery.
- an Invitation's token hash and expiry are written before its email job is published, so a pending Invitation can exist with no delivered link. The Admin can resend it.

There is no transactional outbox in the current source.

## Shared infrastructure and lifecycle

These objects are created at module import and live for the process lifetime:

| Object | Source |
|---|---|
| validated `env` | `src/config.ts` |
| Drizzle `db` | `src/drizzle/index.ts` |
| MinIO client and Redis singleton | `src/utils.ts` |
| BullMQ queue | `src/queue/email.ts` |
| production service singletons | `src/service/*.ts` |
| JWT and role guard plugins | `src/middleware/*.ts` |
| BullMQ worker and Nodemailer transporter | `src/worker/email.ts` |

Importing a route or service can therefore create network clients transitively. No explicit graceful-shutdown hook closes these resources in `src/index.ts` or `src/workers.ts`.

`src/utils.ts` imports `ioredis` directly, but `package.json` does not declare it directly. The checkout currently receives it transitively; maintainers should not treat that as a stable dependency contract.

## Configuration

Configuration is mostly centralized in `src/config.ts`. Importing it eagerly parses required numbers/booleans and fails startup on missing or malformed values. It covers database, API, JWT/cookies, Redis, SMTP, frontend, OTP, development bypass, MinIO settings, and the optional `EVALUATION_PERIOD_END` override.

Exceptions are tooling entry points:

- `drizzle.config.ts` imports validated config but passes `process.env.DATABASE_URL` to Drizzle Kit;
- `src/drizzle/seed.ts` reads `process.env.DATABASE_URL` directly;
- Nginx-only variables are consumed by `nginx/nginx.conf.template`, outside application config.

`SMTP_STARTTLS` and `SMTP_SECURE` are required and validated but are not passed to `nodemailer.createTransport` in current source.

Canonical deployed values, secret storage, Redis security settings, and environment ownership are **Unknown / Requires Organizational Knowledge**. See [Development](development.md) and [Deployment](deployment.md) for command- and environment-level guidance.

## Logging and operational visibility

The API uses structured request/error logging with Bangkok-local timestamps. It records method, URL, content type, authorization-header presence, forwarded IP, and user agent; the health route is excluded from automatic request logs. Expected parse/validation errors become 400, framework not-found errors become 404, and unexpected errors become generic 500 responses.

Worker delivery, MinIO deletion, some service fallback, seed, and startup paths still use `console.log`/`console.error`. No metrics, tracing, request correlation ID, BullMQ event monitoring, or dependency-aware readiness check exists in source.

The production log aggregation, alerting, metrics, tracing, and health-check ownership are **Unknown / Requires Organizational Knowledge**.

## Build and deployment shape

There is no general application build script. `Dockerfile` is the release packaging path:

- dependencies are installed with `bun install --frozen-lockfile`;
- the worker is compiled to `worker-bin`;
- the API source, dependencies, Drizzle config, and seed inputs are copied into the runtime image;
- the default image command runs `bun src/index.ts`.

`docker-compose.yaml` supplies development, staging, and production profiles with API, worker, PostgreSQL 17, Redis 7, object storage, and Nginx services. The object-storage service is named `minio` but runs a digest-pinned `rustfs/rustfs` image.

The `migrate-prod` service is intentionally a **no-op**. It prints a warning that production data/schema changes are imported manually. The one checked-in production schema script is `deploy/production/invitations.sql`, which creates `Invitations` (ADR-0015). Beyond that, the owner, procedure, validation, rollback, and recovery steps for production schema/data changes are **Unknown / Requires Organizational Knowledge** and must be established before production changes.

Since 2026-11-09 the repository has a production release path, `deploy/production/Makefile`. It builds a commit on `origin/main` for `linux/amd64`, pushes it as `rawinan/twhp-elysia-api:<short sha>`, checks the image against the live database and `docker.env` (`fit-check.ts`, read-only), writes a verified `pg_dump` (`backup.sh`), and then recreates only `api` and `worker`. Compose still names the floating `:latest` tag, and the release re-points `:latest` on the server to the chosen image. `rollback TAG=previous` restores the image that ran before. No target runs `db:push`, `db:seed`, or a Compose `down`, so schema changes still need a separately reviewed migration. Replica counts, restore testing, and disaster recovery remain **Unknown / Requires Organizational Knowledge**. See [Deployment](deployment.md).

## Architectural invariants

Before changing cross-cutting behavior, preserve or explicitly revise these invariants:

1. All HTTP routes live under `/twhp/api` and are registered through `src/routes/` autoload.
2. `src/drizzle/schema.ts` is the single database schema declaration.
3. Latest log rows determine current cover/answer state.
4. Scores are calculated on demand; the Grade is stored at finalize.
5. Standard enum keys, enrollment columns, service mappings, DTOs, and seed data must remain aligned.
6. File I/O stays outside database transactions and therefore requires failure compensation.
7. API and Nginx request-body limits both currently allow 130 MB.
8. The weekday validation reminder declares `Asia/Bangkok` in its job scheduler (`src/queue/schedule.ts`); it must not go back to relying on the process timezone.
9. Service factories inject a database, not every external dependency.
10. Cover status is resolved only through `src/service/coverStatus.ts`; a second `coverLogs` subquery is a review failure (ADR-0010).
11. The `{ items, meta }` pagination envelope is scoped to the nine staff list endpoints. Bounded collections stay bare arrays (ADR-0007), and every paginated query must impose a total order or OFFSET has no defined meaning (ADR-0009).
12. An evaluator's `change_score` is terminal and preserves evidence; only a hard reject (`status = 'rejected'` **and** `verdict_choice IS NULL`) deletes files and returns the Cover to the factory (ADR-0012).
13. A Provincial Officer reads Covers through the same `evaluatorReviewService.getAnswers` as the Evaluator and DOED reads; no write route exists under `provincialOfficers/**` except the seeded first-login `PATCH /provincialOfficers/password` (ADR-0013).
14. `src/service/awardHistory.ts` is the only reader of `Awards` for "held gold in fiscal year Y"; grading and the enrolment lockout both use it (ADR-0014).
15. An Invitation is its own `Invitations` row. No `Accounts` or profile row exists until acceptance, so no query over accounts needs a "pending" filter (ADR-0015).

## Evidence status

Architecture, bootstrap, imports, scripts, and container definitions above were verified from source and configuration on 2026-09-02 and re-checked on 2026-11-11. Since the 2026-07-15 audit, `docker-compose.yaml` changed (RustFS, 2026-11-09), `src/config.ts` changed (`EVALUATION_PERIOD_END`, 2026-11-06), and `src/middleware/` changed (scoped role guards, 2026-11-09). The statements above about those files reflect the 2026-11-11 check. `Dockerfile` and `nginx/` are unchanged since 2026-07-15, so statements about them carry that earlier verification forward. Failure outcomes described across separate systems are reasoned from operation ordering and should be fault-injection tested before remediation. Deployed runtime versions and all organization-owned operational procedures are explicitly unknown.
