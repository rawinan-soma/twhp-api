# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot-reload, pino-pretty logs)
bun run dev

# Production
bun run start

# BullMQ worker process (separate from API)
bun run worker

# Database
bun run db:push    # Push schema.ts to DB via drizzle-kit (no migration files)
bun run db:seed    # Seed from seed_data/ (CSV + JSON)
```

`package.json`'s `test` script is a placeholder that exits 1. The real runner is `bun test <files>`.
There are 32 test files: 13 PostgreSQL integration and 19 isolated — the 18 below plus the temporary `src/service/evaluationPeriod.test.ts`.

```bash
# Isolated only — safe anywhere. 286 pass / 0 fail as of 2026-09-25.
bun test src/config.test.ts src/logging.test.ts src/routes/authentication/index.test.ts src/routes/index.test.ts \
  src/service/auth-dev-bypass.test.ts src/service/authentication.2fa.test.ts \
  src/service/coverStatus.test.ts src/service/health.test.ts src/service/pagination-routes.test.ts \
  src/service/pagination.test.ts src/service/score.test.ts \
  src/logger.test.ts src/worker/email.test.ts \
  src/telemetry.test.ts src/clientSpan.test.ts src/tracing.test.ts src/utils.test.ts src/queue/email.test.ts

bun ./node_modules/.bin/biome check src   # read-only lint; the package scripts all --write
```

Never run bare `bun test` or a `*.integration.test.ts` file until `DATABASE_URL` names a disposable
database — the preload falls back to the ordinary local `twhp` database and the tests mutate it.

**Docker** (uses `docker.env`):
```bash
docker compose --profile dev up --build        # Dev with hot-reload (rebuild on schema/dep changes)
docker compose --profile production up         # Production build
```
The `migrate-dev` service runs `db:push && db:seed` as a one-shot before `api-dev` starts. If schema changes don't apply after `down -v && up`, always pass `--build` — Docker caches the `twhp-api:dev` image.

`worker-dev` bakes its source in at `build` (`target: build`) — it has **no bind mount**, so it does
not hot-reload and `up -d` without `--build` keeps running the old code indefinitely, even while
`api-dev` is rebuilt around it. **Any change under `src/worker/` or `src/queue/` needs
`docker compose --profile <dev|staging> up -d --build worker-dev`.** A stale worker is silent: the
API enqueues the new payload shape and the old worker quietly ignores the fields it doesn't know
(this is what dropped the safety-officer `cc` from verdict emails on staging for two weeks —
see `.scratch/verdict-email-safety-officer/issues/01-safety-officer-cc-not-delivered.md`).
Production runs a compiled `./worker-bin` from `rawinan/twhp-elysia-api:latest`; that image must be
rebuilt and pushed, not just restarted.

## Architecture

**Runtime**: Bun + ElysiaJS. Prefer `Bun.env`, `Bun.SHA256` etc. over Node equivalents.

**API prefix**: All routes under `/twhp/api`. OpenAPI docs at `/twhp/api/document`. Health: `/twhp/api/health/live` (alias `/twhp/api/health`) for liveness, `/twhp/api/health/ready` for PostgreSQL/Redis/MinIO readiness; all three are skipped from request logs. Container healthchecks must use `live`.

### Routing (autoload)

Routes are **auto-registered** from `src/routes/` via `elysia-autoload` in `src/index.ts`. There is no manual route registration and no `src/controller/` folder — files under `src/routes/<domain>/[...nested]/index.ts` are the route layer.

Each route file exports a default `(app: App) => app.group(...)` that attaches guards, defines endpoints, and wires `xxxService` methods. Nested folders become nested path segments (e.g. `src/routes/factories/assessments/index.ts` → `/twhp/api/factories/assessments/*`).

### Layer structure (per domain)

- `src/routes/<domain>/**/index.ts` — ElysiaJS route definitions with TypeBox validation + OpenAPI detail
- `src/service/<domain>.ts` — Business logic, exported as a singleton via `createXxxService(db)` factory
- `src/schema/<domain>.ts` — TypeBox DTOs for request/response validation

### Services

Services follow the factory-function pattern:
```ts
export const createXxxService = (database: typeof db) => ({ ... });
export const xxxService = createXxxService(db);  // singleton at bottom of file
```
Routes import the `xxxService` singleton. The `createXxxService(db)` factory exists so services can be instantiated against a test/alt DB if needed.

**Services return `status(code, body)` (Elysia's `ElysiaCustomStatusResponse`) rather than throwing.** Routes check for these and return them directly. Global error handler in `src/logging.ts` (mounted by `src/index.ts`) catches unexpected errors and returns 500 with an error log.

### Schemas

`src/schema/index.ts` auto-generates base TypeBox schemas from Drizzle tables via `drizzle-typebox` (`createSelectSchema`, `createInsertSchema`, `createUpdateSchema`). Domain files in `src/schema/` extend these — when adding DTOs, compose from `BaseXxxSelect/Insert/Update` rather than re-declaring column shapes.

### Auth flow

- Cookie-based JWT: `Authentication` (access) + `Refresh` cookies
- `src/middleware/jwt.ts` — `jwtPlugin` globally derives `jwtPayload`; verifies access token, auto-rotates refresh token, or returns 401
- `src/middleware/rbac.ts` — `requireRoles(...roles)` plugin guards routes by role
- `src/middleware/guards.ts` — Pre-composed guards: `adminGuard`, `factoryGuard`, `evalGuard`, `officerGuard` (use these in routes, don't compose `jwtPlugin + requireRoles` manually)
- Roles enum in `src/service/authentication.ts`: `Factory`, `Provincial`, `Evaluator`, `DOED`

### Database

PostgreSQL via Drizzle ORM. **Single-file schema** at `src/drizzle/schema.ts`. `drizzle.config.ts` points to it. DB client is a plain `drizzle(env.DATABASE_URL)` export from `src/drizzle/index.ts`.

**Do not edit drizzle migration output directly** — generate schema changes via schema.ts and use `db:push` for dev. For production, import CSV/data directly (see `migrate-prod` in compose).

**Standard enum**: The `standardTypes` pgEnum has 11 values in camelCase: `standardHC`, `standardSAN`, `standardSANPlus`, `standardWellness`, `standardSafety`, `standardTIS18001`, `standardISO45001`, `standardISO14001`, `standardZero`, `standard5S`, `standardHAS`. These match the keys used in `standardBoolMap`/`standardUrlMap` inside `src/service/answer.ts`, and must stay in sync with `seed_data/questions.json`.

### Cover status

Current Cover status is the `coverLogs` row with the greatest **serial `id`**, never the greatest
timestamp. That rule has one owner: `src/service/coverStatus.ts`, which exports
`latestCoverLogLateral(db)` for a `LEFT JOIN LATERAL` in list/count queries and a standalone read for
one already-known Cover. Every query that filters, counts, or paginates on Cover status must import
from it; a second correlated subquery over `coverLogs` is a review failure. See
`docs/adr/0010-lateral-latest-cover-log-resolution.md`.

Answer status follows the same latest-log rule but is **not** yet centralized.

### Pagination

The nine staff list endpoints — `/{admins,evaluators,provincialOfficers}/{factories,enrolls,score}` —
return an `{ items, meta }` envelope built from `src/schema/pagination.ts`. Compose `PaginationQuery`
into the route's existing query schema with `t.Composite`; do not replace it. Every paginated query
must impose a total order, or OFFSET has no defined meaning. Every other list stays a bare array.
See ADRs 0007, 0009, and 0011.

### Review verdicts

An evaluator's `change_score` is **terminal**: it writes `recommended`, keeps `verdict_choice` and
`description`, preserves evidence, and the factory has no response to it — `accept` and `redo` both
return 400. Only a hard reject bounces the Cover and deletes files, and on a standard-backed question
it also deletes the named standard certificates and un-claims them for the fiscal year.

The classification is normative and must not be narrowed to a status test:

> A hard reject is `status = 'rejected'` **AND** `verdict_choice IS NULL`.
> A settled score change is any Answer whose latest log carries a non-null `verdict_choice`.

Rows written before 2026-08-25 are `rejected` **with** a `verdict_choice`; they are score changes. No
migration was run. Finalize writes the settled Verdict Score into `answers.selected_choice` and is the
only writer of `finished`. See `docs/adr/0012-score-changes-are-terminal.md`.

### Provincial read-only review

A Provincial Officer reads Covers in its province through the **same**
`evaluatorReviewService.getAnswers` and `AnswerViewSchema` the Evaluator and DOED reads use — there is
no parallel provincial read, and adding one is a review failure. Two rules fire only for
`ReviewerScope.kind === "province"`:

> An `in_progress` Cover returns `404 { message: "cover not found" }`, byte-identical to the
> out-of-province response — never a 403, which would confirm the Cover exists.
> While `in_review`, every Answer's `verdictChoice` and `description` are forced `null` and its
> per-Answer `status` is forced `in_review`. Standard certificates are never redacted.

The redaction lives in the service, not the route, so any route reusing `getAnswers` inherits it. The
Officer resolves at level `ODPC` **for category filtering only** — it means "all five categories",
never authority; no write route may be exposed under `provincialOfficers/**`. Any change to the
verdict fields needs a province-scope test alongside the Evaluator one. See
`docs/adr/0013-province-scoped-read-only-cover-review.md`.

### Fiscal year

All enrollment/cover queries are scoped to the current fiscal year (Oct 1 – Sep 30). Always use `utilities().getFiscalYear()` from `src/utils.ts` — don't hand-roll date boundaries.

### File storage

MinIO object storage. Use `utilities().uploadFile(file)` / `utilities().deleteFile(url)` / `utilities().getPresignedUrl(name)` from `src/utils.ts`. Files are stored with UUID filenames; only the filename (not full URL) is persisted to DB — the presigned URL helper rewrites internal Docker hostnames to public-facing ones via `MINIO_PUBLIC_URL`.

**File I/O is always done outside DB transactions** — upload first, then run the transaction with resulting URLs. See `src/service/answer.ts` for the pattern.

### Background jobs

BullMQ + Redis. Queue in `src/queue/email.ts`, worker in `src/worker/email.ts`, entrypoint `src/workers.ts` (run as separate process via `bun run worker`). `src/workers.ts` also registers a daily repeatable job at 8:30 AM Bangkok time.

### Tracing

OpenTelemetry, hand-written per ADR-0014 — `@elysiajs/opentelemetry` is not approved. Every API
command preloads `./src/telemetry.api.ts` (package scripts, Dockerfile, Compose) so `pg` is patched
before Drizzle loads it; it is deliberately not a `bunfig.toml` preload, which would also run in the
worker and `db:*`. `--preload` goes before the entry file and never before `run` — `bun --preload
<file> … run` prints Bun's help and exits; `dev` is `bun --watch --preload <file> src/index.ts`.
`src/telemetry.ts` holds the provider (OTLP export only when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set). `src/tracing.ts` is the request-span plugin mounted before
autoload: one SERVER span per request named `<METHOD> <route>`, an **allow-list** of attributes
(method, route, path without query, status, `enduser.id`), inbound `traceparent` ignored, health not
traced, and `X-Request-Id` = trace ID on every response. Calls Bun can't auto-instrument get a
`withClientSpan` from `src/clientSpan.ts` (MinIO helpers, `emailQueue.add`): operation and bucket
or queue/job name only — never object names, URLs, payloads or error messages. Tests read spans
from `testSpans` (`src/test/spans.ts`), registered by the test preload.

### Config

All env vars are validated at startup in `src/config.ts`. Missing or malformed vars throw immediately. Required: `DATABASE_URL`, `APP_PORT`, `AUTH_JWT_SECRET`, `AUTH_TOKEN_EXP`, `REFRESH_JWT_SECRET`, `REFRESH_TOKEN_EXP`, `COOKIE_SECURE`, `REDIS_HOST`, `REDIS_PORT`, `SMTP_*`, `FRONTEND_URL`, `MINIO_*`. Optional telemetry: `OTEL_EXPORTER_OTLP_ENDPOINT` (http(s) URL; unset exports nothing) and `DEPLOYMENT_ENV` (default `development`). Add new env vars here — don't reach for `Bun.env` directly elsewhere.

### Logging

One pino configuration in `src/logger.ts` serves the API and the worker
(`createLogger("twhp-api" | "twhp-worker")`). Lines are JSON with `time` in Bangkok ISO
(`2026-09-25T14:30:05.123+07:00`), a `service` field, and whatever `logMixin` returns: the active
span's `trace_id`/`span_id`, nothing outside a span.

`src/logging.ts` exports `createLogging(stream?, mixin?)`: the API's logger plus the
request-logging plugin `src/index.ts` mounts; tests pass a stream to capture lines. Each successful
request writes one light line: `method`, `path` (no query string), `route`, `status`, `durationMs`,
and `userId` when authenticated. The three health routes (`isHealthPath`) are not logged. `onError`
classifies errors into expected (`VALIDATION`, `INVALID_FILE_TYPE`, `PARSE` → 400), `NOT_FOUND` →
404, and unexpected → 500; `onAfterResponse` logs any 4xx/5xx that `onError` didn't. Both log
`request`, which the shared serializer reduces to `{ method, path }`.

**No PII or secrets in logs.** Never log query strings, headers, bodies, IPs, user-agents, email
addresses, names, phone numbers, tokens, cookies, passwords or OTPs; refer to people by internal IDs
(`userId`, `factoryId`, `jobId`). Worker job lines carry `jobId`, `jobName` and recipient counts, and
SMTP errors are logged as class and codes only. Unexpected-error lines pass the message through
`scrubErrorMessage`, which drops Drizzle's bound `params:`. `redact` in `src/logger.ts` is a safety
net, not permission, and reaches only six levels deep. Don't add `console.*` to the API or worker —
use these loggers (`src/utils.ts` and the evaluator email enqueue path still predate this rule).

## Human-Agent Collaboration Model

### Roles
- **Human**: Defines requirements, makes architecture decisions, reviews changes, specifies routes, endpoints, context (parameters, body, query), response schemas, and service-layer logic.
- **Agent**: Implements service-layer logic and fills in response schemas according to spec.

### Workflow
1. Human describes the task and context (often as route-file comments or a verbal spec).
2. Agent analyzes and proposes an approach before implementing.
3. Agent edits the relevant service/route, reusing existing helpers where possible.
4. Human reviews and approves or requests changes.
5. Agent does not push to remote without explicit permission.

### Constraints
- Do not commit directly to `main`/`master`.
- Do not modify drizzle migration files directly — generate them and wait for human review.
- Ask first if a task is unclear — do not assume and implement.
- Ask for permission before installing any new dependency.
- For large tasks, break into subtasks and confirm approach first.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Handover documentation

`docs/` is a maintained handover set. Start at `docs/handover.md`, then `docs/README.md` for the
reading order and task-to-document map. `README.md` is the project entry point. `AGENTS.md` is the
working agreement for agents on this repository — read it before non-trivial work.

Read the relevant ADR before changing scoring, authentication, review/finalization, evidence
deletion, list pagination, Cover-status resolution, or what a reader role may see of a Cover.
ADR-0006 is superseded in full by ADR-0012;
ADR-0004's consensus loop is superseded in part by it.

When a public contract or business rule changes, update the affected guide and ADR in the same
change.
