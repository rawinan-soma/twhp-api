# TWHP API

Backend for the **Total Worker Health Promotion (TWHP)** programme: factory registration, annual
enrollment, workplace-health assessment with evidence upload, geographically scoped evaluator review,
finalization, on-demand score/grade calculation, and email notification.

Bun + ElysiaJS + PostgreSQL (Drizzle) + Redis/BullMQ + MinIO. Two processes: the HTTP API and the
email worker.

> **Transferring or receiving this project?** Start at **[docs/handover.md](docs/handover.md)**, then
> the reading order in **[docs/README.md](docs/README.md)**. This file is orientation only; those
> documents carry the verified detail, the fragile areas, and the questions the organization still
> owns.

---

## At a glance

| | |
|---|---|
| Runtime | Bun 1.3.6 (development machine); production image uses the floating `oven/bun:1` family |
| Framework | ElysiaJS, filesystem route autoload (`elysia-autoload`) |
| Database | PostgreSQL 17 via Drizzle ORM, single schema file `src/drizzle/schema.ts` |
| Queue / cache | Redis 7 + BullMQ (`email` queue, daily 08:30 Bangkok repeat job) |
| Object storage | MinIO (evidence PDFs and standard certificates) |
| API prefix | `/twhp/api` |
| Health | `GET /twhp/api/health` — liveness only, checks no dependency |
| OpenAPI | `GET /twhp/api/document` (blocked by the production proxy) |
| Version | `package.json` `1.0.50` |

## Repository map

```text
src/
├── index.ts        API composition root (autoloads src/routes)
├── workers.ts      worker composition root + daily repeat schedule
├── config.ts       eager env validation — every env var is declared here
├── utils.ts        fiscal year, MinIO, Redis helpers
├── drizzle/        schema.ts (all tables/enums), index.ts (db client), seed.ts
├── middleware/     jwt.ts, rbac.ts, guards.ts
├── routes/         HTTP adapters; directory path == URL path
├── schema/         TypeBox DTOs composed from drizzle-typebox bases
├── service/        business workflows + Drizzle queries (one per domain)
├── queue/          BullMQ producer
├── worker/         BullMQ consumer + Nodemailer templates
└── test/setup.ts   Bun test preload

docs/               maintainer handover documentation (start here)
docs/adr/           accepted architecture decisions, 0001–0012
CONTEXT.md          domain vocabulary and the current review/score model
AGENTS.md           working agreement for AI agents on this repository
memory-bank/        intent/story/bolt implementation history (AI-DLC)
.specs-fire/        FIRE intent briefs, work items, and run artifacts
seed_data/          CSV/JSON seed inputs — git-ignored, supplied out of band
```

## Quick start (native)

Requires Bun, plus reachable PostgreSQL, Redis, and MinIO instances.

```bash
bun install
cp docker.env .env            # shape reference — then fill in real development-only values
bun run db:push               # push src/drizzle/schema.ts to the database
bun run db:seed               # needs seed_data/ (not in git)
bun run dev                   # API with hot reload + pino-pretty
bun run worker                # email worker, separate process
```

`src/config.ts` validates every environment variable at import and refuses to start on a missing or
malformed one. Required: `DATABASE_URL`, `APP_PORT`, `AUTH_JWT_SECRET`, `AUTH_TOKEN_EXP`,
`REFRESH_JWT_SECRET`, `REFRESH_TOKEN_EXP`, `COOKIE_SECURE`, `REDIS_HOST`, `REDIS_PORT`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_STARTTLS`, `FRONTEND_URL`, and the six
`MINIO_*` values. Optional with defaults: the five `OTP_*` tuning values, `DEV_SKIP_OTP` (default
`false`), and `DEV_BYPASS_SECRET` (default empty, which fails closed). `NGINX_API_KEY` and
`NGINX_API_UPSTREAM` are consumed by the proxy template, not by `src/config.ts`.

## Quick start (Docker Compose)

Uses `docker.env`. Always pass `--build` after a schema or dependency change — the `twhp-api:dev`
image is cached.

```bash
docker compose --profile dev up --build        # migrate-dev (db:push && db:seed) then api-dev
docker compose --profile production up
```

Compose expects API port 3000, PostgreSQL host port 5433, Redis host port 6380, an existing external
`shared-web-network`, and an external TLS/edge layer. `migrate-prod` is deliberately a no-op that
prints a warning — production schema and data changes are imported manually and the procedure is not
in this repository. See [docs/deployment.md](docs/deployment.md) before deploying anything.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | API with `--watch` and pretty logs |
| `bun run start` | API from source (the release image command) |
| `bun run worker` | BullMQ email worker + daily schedule |
| `bun run db:push` | `drizzle-kit push` — no migration files are generated |
| `bun run db:seed` | Seed from `seed_data/` |
| `bun run format` / `lint` / `check` | Biome, **all with `--write`** — they mutate source |
| `bun test <file>` | The real test runner |
| `bun run test` | **Stale placeholder that exits 1.** Not evidence that tests are absent. |

Read-only lint: `bun ./node_modules/.bin/biome check src`.

## Tests

18 test files, 315 declared cases. 8 files are isolated; 10 are PostgreSQL integration tests.

```bash
# Isolated, safe to run anywhere. 201 pass / 0 fail as of 2026-09-02 (Bun 1.3.6).
bun test src/config.test.ts src/routes/authentication/index.test.ts \
  src/service/auth-dev-bypass.test.ts src/service/authentication.2fa.test.ts \
  src/service/coverStatus.test.ts src/service/pagination-routes.test.ts \
  src/service/pagination.test.ts src/service/score.test.ts
```

> **Do not run bare `bun test`** until `DATABASE_URL` names a disposable database. The integration
> files insert and delete against whatever `DATABASE_URL` resolves to, and the test preload falls back
> to the ordinary local `twhp` database on `localhost:5433`. See [docs/testing.md](docs/testing.md).

## Conventions that are load-bearing

- **Routes are autoloaded** from `src/routes/`. Directory segments become URL segments and `[param]`
  becomes `:param`. There is no manual registration and no controller layer.
- **Services return `status(code, body)`** rather than throwing; routes pass the result straight back.
  Each service exports `createXxxService(db)` plus a production singleton.
- **DTOs compose from `src/schema/index.ts`**, which generates base TypeBox schemas from the Drizzle
  tables. Do not re-declare column shapes.
- **Current Cover/Answer state is the latest log row by serial `id`**, never by timestamp. Import
  `latestCoverLogLateral` from `src/service/coverStatus.ts`; do not write a second subquery
  ([ADR-0010](docs/adr/0010-lateral-latest-cover-log-resolution.md)).
- **Score and grade are computed on demand** and never persisted
  ([ADR-0001](docs/adr/0001-score-calculated-on-demand.md)).
- **A fiscal year runs Oct 1 → Oct 1.** Always call `utilities().getFiscalYear()`.
- **File I/O happens outside database transactions** — upload or delete first, then run the
  transaction. Every such workflow needs explicit compensation.
- **An evaluator's score change is terminal**; only a hard reject returns the Cover to the factory
  ([ADR-0012](docs/adr/0012-score-changes-are-terminal.md)).
- **The nine staff list endpoints are paginated** with an `{ items, meta }` envelope; every other list
  is a bare array ([ADR-0007](docs/adr/0007-pagination-envelope-scoped-exception.md),
  [ADR-0009](docs/adr/0009-offset-pagination-for-staff-lists.md)).

## Known gaps before production ownership

Summarized here so they are not discovered late; the evidence is in
[docs/technical-debt.md](docs/technical-debt.md).

- Refresh JWTs are not cryptographically verified before a hash match mints a new session.
- Evaluator detail routes and file presigning do not check resource ownership.
- Core cardinalities (one enrollment per factory-year, one cover per enrollment, one answer per
  cover-question) are service pre-checks, not database constraints.
- Finalize has no idempotency, lock, or already-finished guard.
- `migrate-prod` is a no-op and production images use mutable tags; there is no CI, readiness probe,
  backup, restore, or rollback in this repository.
- MinIO and PostgreSQL changes are not atomic.

## Documentation

| Document | Purpose |
|---|---|
| [docs/handover.md](docs/handover.md) | **Start here.** Status, stable/fragile areas, first-day checklist, open organizational questions |
| [docs/README.md](docs/README.md) | Documentation index, reading order, and task-to-document map |
| [CONTEXT.md](CONTEXT.md) | Domain vocabulary, verdict/score model, evaluation flow diagram |
| [docs/adr/](docs/adr/) | Accepted decisions 0001–0012 — read before changing scoring, review, auth, or pagination |
| [AGENTS.md](AGENTS.md) | Working agreement for AI agents |
| [CLAUDE.md](CLAUDE.md) | Claude Code project instructions |
| [docs/api/](docs/api/) | Generated OpenAPI snapshot — useful for discovery, known to drift |

Current source and configuration are authoritative for implemented behavior. Where prose disagrees
with code, the documents record the conflict rather than resolving it silently.
