# Development

This guide documents the development commands and service topology that are currently implemented in the repository. For system design, see [Architecture](architecture.md). For schema and seed behavior, see [Database](database.md).

## Prerequisites

- [Bun](https://bun.sh/) is the runtime and package manager.
- Docker Engine with Docker Compose is required for the repository-defined PostgreSQL, Redis, MinIO, API, worker, and Nginx stack.
- Git is required for the normal source workflow.

The exact supported Bun version is **not pinned**. `package.json` has no `engines` or `packageManager` declaration, and the Dockerfile selects Bun major version 1 rather than an immutable release. Use a Bun 1.x version compatible with the committed `bun.lock` until the project adopts an exact toolchain version.

Install dependencies from the lockfile:

```bash
bun install --frozen-lockfile
```

Do not commit `.env` or `docker.env`. Both are excluded from the Docker build context and Git. The complete key-only configuration inventory is in [Deployment: Environment variables](deployment.md#environment-variables).

## Native development

Native execution requires reachable PostgreSQL, Redis, MinIO, and SMTP services plus all environment variables validated by `src/config.ts`.

Start the API with hot reload and pretty logs:

```bash
bun run dev
```

Start it without watch mode:

```bash
bun run start
```

Start the BullMQ worker in a separate process:

```bash
bun run worker
```

The worker consumes the `email` queue and registers the daily factory-validation reminder. Compose sets `TZ=Asia/Bangkok`; native worker execution otherwise uses the host process timezone.

The API routes are:

| Purpose | Path |
| --- | --- |
| API prefix | `/twhp/api` |
| Liveness endpoint | `/twhp/api/health` |
| OpenAPI UI | `/twhp/api/document` |

`APP_PORT` controls the native listen port. In the current Compose topology it must be `3000`, because the Docker health checks, Nginx upstreams, and Dockerfile exposure all use port 3000 directly.

The health endpoint returns a static response. It is a **liveness** check only and does not establish PostgreSQL, Redis, MinIO, or SMTP readiness.

## Database setup

**Mutation guard:** before running either command below, independently verify that `DATABASE_URL` points to a disposable development database. Both commands mutate state: `db:push` can alter/drop schema objects and `db:seed` changes data and resets seeded staff credentials. Review the Drizzle DDL plan and never use these commands against shared, staging, or production-like data.

Push the Drizzle schema and load development seed data:

```bash
bun run db:push
bun run db:seed
```

Important behavior:

- `db:push` applies `src/drizzle/schema.ts` directly. The repository does not contain a production migration-file workflow.
- `drizzle.config.ts` imports the eagerly validated application config, so `db:push` currently requires all required application settings even though Drizzle Kit only consumes `DATABASE_URL`.
- `db:seed` reads CSV and JSON inputs from `seed_data/`, upserts reference data and staff accounts, and creates or resets a fixed development administrator.
- Seed execution is not production-safe. It can overwrite seeded account credentials and is not wrapped in one global transaction.

See [Database](database.md) before changing schema or seed behavior.

## Tests and quality commands

`bun run test` is a placeholder script that always exits unsuccessfully. It is not the test runner.

The repository contains Bun unit tests and PostgreSQL integration tests. Integration tests mutate database fixtures and must run only against a disposable, correctly seeded database—never a shared, staging, or production database.

Follow [Testing](testing.md) for the approved isolated-test commands, disposable database preparation, and suite boundaries. This document intentionally does not recommend running the whole suite without those safeguards.

The available formatting and lint scripts are:

```bash
bun run format
bun run lint
bun run check
```

All three currently use Biome's write mode and can modify source files. There is no repository-defined non-mutating CI quality command.

## Docker development stack

**Mutation guard:** the development profile automatically runs `db:push` and `db:seed` using `docker.env`. Verify that its destination is disposable development data before starting the profile. The staging profile runs the same automatic mutations and must not be treated as a safe or production-like target.

Build and start the development profile:

```bash
docker compose --profile dev up --build
```

The implemented startup graph is:

```text
postgres (healthy) ----+
                       +--> migrate-dev --> api-dev (healthy) --> worker-dev
redis (healthy) -------+          |               |
                                  |               +--> nginx-backend
minio ------------------------------------------------> nginx-backend
```

`migrate-dev` runs `db:push` followed by `db:seed` and must finish successfully before `api-dev` starts. `worker-dev` waits for API liveness and Redis health.

### Development ports

| Component | Container port | Host binding | Access |
| --- | ---: | --- | --- |
| Nginx | 80 | `127.0.0.1:81` | Development HTTP entry point |
| API | 3000 | Not published | Through Nginx or the Compose network |
| PostgreSQL | 5432 | `5433` | Native development/database tools |
| Redis | 6379 | `6380` | Native API/worker development |
| MinIO API | 9000 | Not published | Through `/twhp/files/` on Nginx |
| MinIO console | 9001 | Not published | Through `/twhp/minio-console/` on Nginx |

Verify API liveness through development Nginx:

```bash
curl --fail http://127.0.0.1:81/twhp/api/health
```

Development Nginx does not apply the staging/production API-key gate and does not hide the OpenAPI UI.

### Clean-checkout dependency caveat

`api-dev` bind-mounts the repository at `/app`, which hides files installed there during the image build. Its anonymous dependency volume is mounted at `/usr/src/app/node_modules`, not `/app/node_modules`. A clean checkout without host `node_modules` can therefore lose access to the dependencies built into the image. Until the Compose mount is corrected, verify development startup from a clean checkout rather than assuming the image layer supplies dependencies.

A clean clone also lacks `seed_data/`: the directory is ignored and no files under it are tracked, while `db:seed`, `migrate-dev`, and the release Dockerfile require it. Obtain the approved authoritative copy through the organization's protected channel before build/seed; do not invent or reconstruct production-like seed inputs from memory.

## Staging profile caveat

The `staging` profile is not production-equivalent. It uses the development build target, hot-reload API command, development worker command, and automatic `db:push` plus `db:seed`. Its Nginx configuration adds the API-key gate and joins the external shared network, but the application and database lifecycle remain development-oriented.

## Troubleshooting

### Schema changes do not appear in Docker

Rebuild the development image; Docker can otherwise reuse the `twhp-api:dev` image:

```bash
docker compose --profile dev up --build
```

### API is unhealthy in Compose

Confirm that:

- `APP_PORT` is 3000;
- `migrate-dev` completed successfully;
- Redis is healthy;
- all required application environment keys exist and use the formats documented in [Deployment](deployment.md#environment-variables).

Remember that a healthy API container proves only HTTP liveness, not all dependency connections.

### Worker does not process mail

Check the worker and Redis logs, then verify the SMTP settings. `SMTP_STARTTLS` and `SMTP_SECURE` are currently validated but are **not passed to Nodemailer**, so they have no runtime effect. Transport-security behavior must not be inferred from those flags until the implementation is corrected and tested.
