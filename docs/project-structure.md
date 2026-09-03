# Project Structure

Use this page to find the code that owns a behavior. Verified on 2026-09-02 on branch `dev`. Read [Architecture](architecture.md) first when a change crosses HTTP, persistence, files, queues, or process boundaries.

## Quick navigation

| If you need to change... | Start here | Then read |
|---|---|---|
| API route or contract | `src/routes/<actor-or-domain>/`, `src/schema/` | [API conventions](api-conventions.md) |
| Business workflow | `src/service/` | [Business rules](business-rules.md) |
| Authentication or roles | `src/routes/authentication/`, `src/middleware/`, `src/service/authentication.ts` | [Authentication and authorization](authentication-authorization.md) |
| Tables or enums | `src/drizzle/schema.ts`, `src/schema/index.ts` | [Database](database.md) |
| File upload/presign/delete | `src/utils.ts`, caller service | [Architecture](architecture.md#postgresql-and-minio) |
| Email or scheduled work | `src/queue/email.ts`, `src/workers.ts`, `src/worker/email.ts` | [Architecture](architecture.md#worker-process) |
| Cover status filter/count/pagination | `src/service/coverStatus.ts` | [ADR-0010](adr/0010-lateral-latest-cover-log-resolution.md), [ADR-0008](adr/0008-exists-subquery-for-enrolled-filter.md) |
| A paginated staff list | `src/schema/pagination.ts`, the route's service | [API conventions](api-conventions.md#pagination), [ADR-0007](adr/0007-pagination-envelope-scoped-exception.md), [ADR-0009](adr/0009-offset-pagination-for-staff-lists.md) |
| Local commands | `package.json`, `bunfig.toml`, `docker-compose.yaml` | [Development](development.md), [Testing](testing.md) |
| Containers or proxying | `Dockerfile`, `docker-compose.yaml`, `nginx/` | [Deployment](deployment.md) |
| Incident diagnosis | relevant service plus infrastructure config | [Troubleshooting](troubleshooting.md) |

## Source tree

```text
src/
├── index.ts                  API composition root
├── workers.ts                worker composition root and repeat schedule
├── config.ts                 eager environment parser/validator
├── utils.ts                  fiscal-year, Redis, and MinIO utilities
├── drizzle/
│   ├── index.ts              production Drizzle client
│   ├── schema.ts             all tables, enums, and foreign keys
│   └── seed.ts               CSV/JSON seed program
├── middleware/
│   ├── jwt.ts                access verification and refresh rotation
│   ├── rbac.ts               role allow-list plugin factory
│   └── guards.ts             role-specific guard singletons
├── routes/                   filesystem-routed HTTP adapters
├── schema/                   TypeBox request/response schemas
│   └── pagination.ts         shared offset-pagination contract for the nine staff lists
├── service/                  workflows and direct Drizzle queries
│   ├── coverStatus.ts        the single latest-cover-log resolution (both query shapes)
│   ├── answerFileRules.ts    pure per-choice evidence requirements
│   └── scoreHelpers.ts       pure score and grade rules
├── queue/
│   └── email.ts              BullMQ producer queue singleton
├── worker/
│   └── email.ts              BullMQ consumer and email templates
└── test/
    └── setup.ts              Bun test environment preload
```

There is no controller or repository directory. Routes perform controller/adapter work; services combine business workflows and persistence queries.

## Route layout

`src/index.ts` autoloads `src/routes/`. Directory segments become URL segments, bracketed names become path parameters, and the app adds the global `/twhp/api` prefix.

Example:

```text
src/routes/evaluators/covers/[coverId]/answers/[answerId]/verdict/index.ts
    -> /twhp/api/evaluators/covers/:coverId/answers/:answerId/verdict
```

Each module default-exports a function accepting the inferred `App` type. Route modules attach guards, define TypeBox/OpenAPI contracts, call service singletons, and return their result.

| Route root | Responsibility |
|---|---|
| `src/routes/index.ts` | Health endpoint |
| `src/routes/authentication/` | Login, staff OTP, reset, logout, current account |
| `src/routes/factories/` | Registration, profile, enrollment, assessments, evidence, score |
| `src/routes/evaluators/` | Evaluator profile/scope, review, finalize, score |
| `src/routes/admins/` | DOED administration and national review adapters |
| `src/routes/provincialOfficers/` | Provincial profile and scoped views |
| `src/routes/location/` | Public geographic lookup |
| `src/routes/file/` | Authenticated presigned file URL |

Do not derive the complete endpoint from filenames alone. A route file may add suffixes such as `covers`, `questions`, `answers`, `answers/negotiate`, or `submission` in its Elysia method calls. Consult the route source or `docs/api/openapi.json`.

`POST /factories/assessments/answers/negotiate` still exists, but since [ADR-0012](adr/0012-score-changes-are-terminal.md) both of its actions are refused on a settled score change; it is reachable only for redoing a hard reject. The path name predates that decision.

The nine staff list routes — `/{admins,evaluators,provincialOfficers}/{factories,enrolls,score}` — compose `PaginationQuery` from `src/schema/pagination.ts` into their existing query schema with `t.Composite` and return an `{ items, meta }` envelope. Every other list route returns a bare array. See [API conventions](api-conventions.md#pagination).

Type-only route imports point back to `src/index.ts` for `App`. This is erased at runtime, but it creates a conceptual navigation cycle: the bootstrap discovers routes while route types reference the bootstrap.

## Service layout

| Module | Primary responsibility |
|---|---|
| `admin.ts` | DOED profile and factory administration queries |
| `answer.ts` | Factory answers, evidence, submission, redo of hard rejects, and the now-unreachable `accept` branch |
| `answerFileRules.ts` | Pure per-choice evidence requirements shared by save, edit, and redo |
| `authentication.ts` | Passwords, JWT/refresh, reset, staff OTP, dev bypass |
| `cover.ts` | Cover creation and current cover state |
| `coverStatus.ts` | The single latest-cover-log rule: a lateral for lists/counts and a standalone read for one Cover (ADR-0010) |
| `enroll.ts` | Enrollment CRUD, scoped lists, standard files |
| `evaluator-review.ts` | Reviewer access, answer verdicts, finalization |
| `evaluator.ts` | Evaluator data and category scope |
| `factory.ts` | Factory profile/list/update workflows |
| `file.ts` | Presigned URL service adapter |
| `location.ts` | Province/district/subdistrict queries |
| `provincialOfficer.ts` | Provincial-officer lookup |
| `question.ts` | Question list |
| `score.ts` | Scoped score-report queries |
| `scoreHelpers.ts` | Pure scoring and grade rules |

Most database services expose `createXxxService(database)` plus a production singleton. This only substitutes the database. Several factories retain global Redis, BullMQ, MinIO, configuration, or service collaborators; see [Architecture: Module organization](architecture.md#module-organization-and-dependency-direction).

Large workflow modules deserve extra care:

- `answer.ts` coordinates many assessment, evidence, state, and factory-response paths.
- `authentication.ts` owns several security protocols and global external dependencies.
- `enroll.ts` coordinates eleven standard/certificate fields and files.
- `evaluator-review.ts` combines access rules, verdicts, finalization, storage, scoring, and notification.

See [Technical debt](technical-debt.md) before restructuring these modules.

## Schema and persistence layout

`src/drizzle/schema.ts` is the single Drizzle schema. `src/drizzle/index.ts` exports the production `db` object. Services import table declarations and issue Drizzle queries directly.

`src/schema/index.ts` generates base TypeBox schemas from Drizzle tables with `drizzle-typebox`. Domain schema files extend, pick, omit, or compose those bases:

```text
src/drizzle/schema.ts
        -> src/schema/index.ts
        -> src/schema/<domain>.ts
        -> src/routes/<domain>/**
```

A database column change can therefore affect transport types. Review both persistence and DTO exposure when changing a table. See [Database](database.md).

## Infrastructure modules

| Path | Ownership and caveats |
|---|---|
| `src/config.ts` | Mostly centralized app config; validates eagerly at import. |
| `src/utils.ts` | Process-global MinIO client, Redis connector creation/singleton, fiscal-year helper. |
| `src/queue/email.ts` | Process-global BullMQ producer handle. |
| `src/workers.ts` | Starts the consumer and registers the daily repeat job. |
| `src/worker/email.ts` | Worker dispatch, Nodemailer transport, templates, scheduled admin query. |
| `src/middleware/jwt.ts` | Authentication plus refresh-session writes. |
| `src/middleware/rbac.ts` | Role authorization. |
| `src/middleware/guards.ts` | Reusable role guard instances. |

These modules instantiate infrastructure at import time. Importing a service in a test can transitively create external clients.

## Tests

Tests are colocated as `*.test.ts` under `src/`; `bunfig.toml` preloads `src/test/setup.ts`. There are 18 test files: 8 isolated and 10 PostgreSQL integration.

The real test runner is:

```bash
bun test
```

The `package.json` `test` script is stale and intentionally exits with `Error: no test specified`; do not use `bun run test` as evidence that tests are absent.

The suite includes both unit tests and PostgreSQL integration tests. Integration tests create a Drizzle client from `DATABASE_URL` and mutate database fixtures. Follow [Testing](testing.md) before running the full suite; do not point it at shared or production data.

## Repository root

| Path | Purpose |
|---|---|
| `package.json`, `bun.lock` | Bun dependencies and scripts; lockfile fixes checkout resolution |
| `bunfig.toml` | Bun test preload |
| `tsconfig.json` | Strict, ESNext, no-emit TypeScript |
| `biome.json` | Formatting and linting rules |
| `Dockerfile` | Release image; source API and compiled worker |
| `docker-compose.yaml` | Development, staging, and production service topology |
| `drizzle.config.ts` | Drizzle Kit configuration |
| `nginx/` | Development and templated staging/production proxy configuration |
| `seed_data/` | CSV/JSON inputs used by `src/drizzle/seed.ts`; ignored and absent from Git, so supplied out of band |
| `scripts/gen-api-docs.ts` | Generates static Markdown/HTML from OpenAPI |
| `CONTEXT.md` | Detailed domain context and current workflow vocabulary |
| `docs/adr/` | Architecture decisions |
| `memory-bank/` | AI-DLC intent, story, bolt, and implementation history |
| `.specs-fire/` | FIRE intent briefs, work items, and per-run plan/test/review/walkthrough artifacts |
| `.scratch/` | Local issue/handover working artifacts |

`drizzle.config.ts` points generated migration output at `src/core/drizzle/generated`, but that directory is absent and the current development workflow uses `db:push`. Production migration in Compose is an intentional no-op; see [Deployment](deployment.md).

`Dockerfile` and `db:seed` require `seed_data/`, but `.gitignore` excludes it and `git ls-files seed_data` is empty. A clean clone cannot reproduce the current image build or seed without an approved out-of-band copy. Its authoritative source and access controls are **Unknown / Requires Organizational Knowledge**.

## Generated and historical documentation

- `docs/api/openapi.json` is a captured API contract artifact, not an API startup input.
- `docs/api/API.md` and `docs/api/index.html` are written by `scripts/gen-api-docs.ts`.
- `docs/adr/` records accepted design decisions.
- `memory-bank/intents/` and `memory-bank/bolts/` preserve detailed implementation history.
- `.specsmd/`, `.agents/`, `.codex/`, `.claude/`, and `docs/superpowers/` support agent/process workflows and are not runtime modules.

The root `README.md` was rewritten on 2026-09-02 as the project entry point: stack summary, repository map, quick start, commands, load-bearing conventions, and links into this documentation set. It is orientation only. Current source is authoritative; use `docs/handover.md`, this set, and `CONTEXT.md` for detail.

## Naming and coupling conventions to watch

- `authentication.ts` exports `createAuthenticationUsecase`, unlike the usual `createXxxService` name, and contains a private misspelling `createAuthentocationService`.
- Role definitions live in `src/service/authentication.ts`, so authorization middleware imports a large service module to obtain `Role`.
- Standard names differ across enum keys and columns, for example `standardHC` versus `standardHc` and `fileStandardHcUrl`.
- Queue job names and payloads are string literals duplicated between producers and the worker switch.
- Answer latest-log queries are still repeated across services and are part of domain correctness. Cover latest-log queries are not: they belong to `src/service/coverStatus.ts` and a second implementation is a review failure (ADR-0010).
- The API and both Nginx configurations separately define the 130 MB request limit.

Treat these as cross-file change indicators: search the repository before modifying any one occurrence.
