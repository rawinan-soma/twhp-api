# AGENTS.md

## Purpose and stack

TWHP is a Bun/TypeScript backend for factory enrollment, annual assessment, hierarchical review,
scoring, authentication, and evidence files. It uses ElysiaJS and TypeBox, Drizzle/PostgreSQL,
BullMQ/Redis, MinIO, Nodemailer, Docker Compose, and Biome.

The API prefix is `/twhp/api`; OpenAPI is `/twhp/api/document`; `/twhp/api/health` is liveness-only
and does not verify dependencies. Treat source and configuration as authoritative for current
behavior. When they conflict with prose, report the conflict and consult the relevant ADR or
maintainer rather than silently choosing.

## Repository boundaries

- `src/index.ts`: API bootstrap, global errors/logging, route autoload, and request-size limit.
- `src/routes/**`: HTTP groups, guards, TypeBox/OpenAPI contracts. Nested paths are autoloaded; do
  not manually register routes or create a controller layer.
- `src/service/*.ts`: business and database behavior. Most modules expose a database-taking factory
  plus a production singleton, but Redis, queues, storage, configuration, and some collaborators
  remain global; database injection is not full isolation.
- `src/schema/*.ts`: request/response DTOs. Compose database-derived base schemas from
  `src/schema/index.ts` where appropriate, while explicitly excluding private fields.
- `src/drizzle/schema.ts`: the single Drizzle schema declaration; `src/drizzle/seed.ts` and
  `seed_data/`: the development seed and its inputs.
- `src/middleware/{jwt,rbac,guards}.ts`: cookie JWT and role enforcement. Use `adminGuard`,
  `factoryGuard`, `evalGuard`, or `officerGuard` on role-specific routes.
- `src/utils.ts`: fiscal-year and MinIO helpers; `src/queue/`, `src/worker/`, and `src/workers.ts`:
  email queue, consumer, and scheduler.
- `docs/api/`: generated/snapshot API material. It can drift from runtime and is not by itself proof
  of status codes or authorization.
- `.scratch/`: local issue tracker and temporary investigation output, not runtime code.

Keep routes as transport adapters, business/database work in services, and DTOs in schemas. Services
conventionally return Elysia `status(code, body)` for expected outcomes; unexpected throws reach the
global 500 handler. Preserve the factory/singleton pattern unless a reviewed design changes its
partial dependency-injection boundary.

## Critical business and security rules

- Roles are exactly `Factory`, `Provincial`, `Evaluator`, and `DOED`. Authentication alone is not
  authorization: enforce ownership plus province/region/category scope in service queries.
- Authentication uses HTTP-only `Authentication` and `Refresh` cookies. Staff login uses
  Redis-backed email OTP except the defined first-login path. Never log or reproduce passwords,
  JWTs, refresh hashes, OTP/reset values, credentials, or full presigned URLs.
- Evaluator detail scoping, filename-only presigning, refresh verification, and non-idempotent
  finalization are known high-risk areas. Do not copy an endpoint's security shape without checking
  [authentication and authorization](docs/authentication-authorization.md).
- Enrollment/Cover queries are fiscal-year scoped from Oct 1 through Sep 30. Always use
  `utilities().getFiscalYear()`; do not hand-roll date boundaries or infer host timezone semantics.
- Current Cover and Answer state is latest-log-wins by greatest log ID. Scores and grades are
  calculated on demand, not persisted. Workflow transitions, reviewer authority, standard
  auto-credit, N/A eligibility, evidence requirements, and grade gates are load-bearing and have
  known prose/code conflicts. Read [business rules](docs/business-rules.md) before changing them.
- Keep `standardTypes` in `src/drizzle/schema.ts`, standard flag/file mappings in services, and
  `seed_data/questions.json` synchronized.
- Persist only MinIO object names, not presigned URLs. Use the shared upload/delete/presign helpers.
  File I/O remains outside PostgreSQL transactions; reason explicitly about orphaned objects and
  dangling references on every failure path. Finalization can irreversibly delete evidence.
- Queue acceptance is not email delivery. The API and worker are separate processes. The daily
  reminder's 08:30 behavior depends on process timezone; Compose sets `Asia/Bangkok`.

## Database workflow

PostgreSQL schema changes start in `src/drizzle/schema.ts`. Development uses schema convergence, not
checked-in migrations:

```bash
bun run db:push
bun run db:seed
```

Both commands mutate schema/data. Use them only against an explicitly verified disposable development
database. Review `db:push` DDL before accepting destructive changes. `db:seed` is not one transaction,
depends on `seed_data/`, and resets/upserts staff credentials; never run it against shared, staging,
or production-like data without explicit owner approval. Do not edit or invent generated migration
output.

Production migration/import is **Unknown / Requires Organizational Knowledge**. Compose's
`migrate-prod` only prints a message and exits successfully; it applies no schema or data. Never
present `docker compose --profile production up` as a complete deployment or substitute
`db:push`/`db:seed` for an approved production migration, backup, verification, and rollback process.

## Commands and safe validation

```bash
# Install exactly the lockfile
bun install --frozen-lockfile

# Long-running API processes
bun run dev
bun run start

# Side-effecting worker: consumes Redis jobs, sends email, and registers a repeatable reminder
bun run worker

# Safe isolated tests; keep authentication files in separate invocations
bun test src/config.test.ts
bun test src/service/auth-dev-bypass.test.ts
bun test src/service/authentication.2fa.test.ts
bun test src/routes/authentication/index.test.ts
bun test src/service/score.test.ts

# Non-mutating static check
bun ./node_modules/.bin/biome check src

# Inspect Compose without starting services
docker compose --profile dev config
docker compose --profile staging config
docker compose --profile production config

# Development stack; mutates the development DB via db:push + db:seed
docker compose --profile dev up --build
```

`bun run test` is a placeholder that always exits 1. Bare `bun test` includes PostgreSQL integration
tests through the global `src/test/setup.ts` preload. Do not run it, or any `*.integration.test.ts`,
until `DATABASE_URL` is explicitly confirmed as a disposable, migrated, seeded test database. Run
overlapping authentication mock suites separately. See [testing](docs/testing.md).

`bun run format`, `bun run lint`, and `bun run check` all use `--write`; do not use them for a
read-only validation pass or let them rewrite unrelated user changes. There is no installed direct
TypeScript compiler and no reproducible typecheck script. The read-only Biome check has a known red
baseline, so report baseline versus introduced diagnostics rather than claiming a clean gate.

Run `bun run worker` only with explicitly approved non-production PostgreSQL, Redis, and SMTP settings. It consumes queued jobs, can send real email, and registers the daily repeatable reminder; merely having environment variables present is not sufficient authorization.

Validate proportionally: focused tests first; integration tests only with the safe database
precondition; then the non-mutating check. For route/schema changes, compare runtime behavior with
OpenAPI. For Docker/config changes, validate Compose expansion and the affected profile. Never claim
completion from the static health endpoint alone.

## Documentation reading map

Start with the [documentation index](docs/README.md), then read only the relevant area:

- Current status, hazards, and first-day sequence: [maintainer handover](docs/handover.md).
- System shape and ownership: [architecture](docs/architecture.md) and
  [project structure](docs/project-structure.md).
- Routes, DTOs, errors, and integrations: [API conventions](docs/api-conventions.md).
- Identity, cookies, roles, and authorization boundaries:
  [authentication and authorization](docs/authentication-authorization.md).
- Vocabulary and workflow changes: [domain model](docs/domain-model.md),
  [business rules](docs/business-rules.md), and relevant records in `docs/adr/`.
- Schema, invariants, seed, and lifecycle: [database](docs/database.md).
- Local work and quality gates: [development](docs/development.md) and
  [testing](docs/testing.md).
- Images, profiles, release gaps, and incidents: [deployment](docs/deployment.md) and
  [troubleshooting](docs/troubleshooting.md).
- Cross-cutting defects and remediation: [technical debt](docs/technical-debt.md).

`CONTEXT.md` preserves useful vocabulary and historical intent, but verified source conflicts exist.
Do not use it to override current code or newer ADRs without surfacing the discrepancy.

Local issues and PRDs use `.scratch/<feature>/`; follow `docs/agents/issue-tracker.md` and
`docs/agents/triage-labels.md`. For domain vocabulary/ADR discovery, follow
`docs/agents/domain.md`.

## Dangerous assumptions

- Do not assume `bun run test` works, bare `bun test` is isolated, Biome is green, or a typecheck
  command exists.
- Do not assume OpenAPI status/security declarations equal runtime behavior.
- Do not assume a service factory isolates Redis, queues, MinIO, configuration, or other services.
- Do not assume pre-insert checks guarantee uniqueness; several critical cardinalities lack database
  constraints and are race-prone.
- Do not assume an authenticated evaluator may read arbitrary IDs or an authenticated user may
  presign arbitrary known filenames.
- Do not assume API success means email delivery, `/health` means dependencies are ready, or
  `APP_PORT` can differ from 3000 in the current container topology.
- Do not assume staging is production-like: it uses the dev image, hot reload, `db:push`, and seed.
- Do not assume production Compose migrates, imports, backs up, rolls back, pins images, or
  provisions the external network/TLS layer.
- Do not expose environment values, inspect secret-bearing Redis/job payloads casually, run
  destructive database commands, delete volumes/objects, replay jobs, or deploy without authority.

## Human-agent collaboration and change control

The human defines requirements, external contracts, architecture decisions, production procedures,
and acceptance. The agent analyzes and proposes an approach before implementing, reuses existing
helpers where appropriate, and reports uncertainty instead of inventing policy. For large work,
break it into bounded subtasks and confirm the approach first. Ask before installing dependencies,
changing schemas/data, regenerating API artifacts, or performing external/deployment actions.

Preserve pre-existing working-tree changes and inspect `git status` before editing. Do not commit
directly to `main`/`master`, push, deploy, rotate secrets, replay jobs, or alter production state
without explicit permission. Do not modify generated database artifacts directly. At handoff, state
files changed, validation run and results, skipped checks with reasons, remaining risks, and any
documentation/source conflict requiring a maintainer decision.
