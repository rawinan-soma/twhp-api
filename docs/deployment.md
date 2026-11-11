# Deployment

This document describes the deployment behavior implemented by `Dockerfile`, `docker-compose.yaml`, and the Nginx configurations. It also records the operational gaps that must be resolved outside the current repository.

Verified 2026-07-15; re-checked 2026-09-02 and 2026-11-11. `Dockerfile` and `nginx/` were last changed on 2026-04-20. `docker-compose.yaml` changed on 2026-11-09 to replace MinIO with RustFS, and `deploy/` was added the same day with the staging and production release tooling described below. Changes merged from 2026-11-09 to 2026-11-10 (#41, #55, #65, #67) need no schema change or extra release step; only Invitations (#61) does.

For developer setup, see [Development](development.md). For persistence details, see [Database](database.md).

## Current deployment model

Docker Compose defines three profiles:

| Profile | Services | Current purpose |
| --- | --- | --- |
| `dev` | PostgreSQL, Redis, `migrate-dev`, `api-dev`, `worker-dev`, RustFS, development Nginx | Local development with build, hot reload, schema push, and seed |
| `staging` | PostgreSQL, Redis, `migrate-dev`, `api-dev`, `worker-dev`, RustFS, templated Nginx | Development-style runtime behind API-key Nginx and an external network |
| `production` | PostgreSQL, Redis, `migrate-prod`, API, worker, RustFS, production Nginx | Pulls a prebuilt application image and starts production services |

Object storage is RustFS, an S3-compatible server. Its Compose service has no profile, so it is the only service selected by a plain `docker compose up` without a profile. The service keeps the name `minio`, and the application keeps its `minio` S3 client and `MINIO_*` variables, so `docker.env` and Nginx are unchanged. A server still running MinIO moves with [the migration runbook](minio-to-rustfs-migration.md).

## Staging release

Staging is released from a laptop with `deploy/staging/Makefile`, which mirrors only the runtime files of a commit (default: the tip of the local `staging` branch) to the server and rebuilds there. It never sends the working tree, and `sync` removes anything else in the server's folder that `rsync-exclude` does not protect.

```bash
make -C deploy/staging diff HOST=<ssh host>      # what would change or be deleted
make -C deploy/staging migrate HOST=<ssh host>   # first, only if schema.ts changed
make -C deploy/staging deploy HOST=<ssh host>
```

`deploy/staging/compose.staging.yml` records what the server runs differently from `docker-compose.yaml`: `migrate-dev` is a no-op, so nothing pushes schema or seeds on `up`, and Nginx uses the development config, with no API-key gate, on the server's LAN address. `deploy/staging/rsync-exclude` protects server-only files, including `docker.env` and `seed_data/`, from the mirror's deletes.

## Production release

Production is released from a laptop with `deploy/production/Makefile`, which builds a commit on `origin/main`, pushes it as an immutable image tag, and recreates only the `api` and `worker` containers.

```bash
make -C deploy/production deploy HOST=<ssh host>
make -C deploy/production rollback HOST=<ssh host> TAG=previous
```

No target runs `db:push`, `db:seed`, Compose `down`, or a free-form Compose command. `deploy` stops before the release if `preflight.sh` does not recognize the stack, if `fit-check.ts` finds a table, column, or enum value the release needs missing from the live database or a `docker.env` the release's config rejects, or if `backup.sh` cannot write a verified `pg_dump` to `~/twhp-backups`. `fit-check` does not compare column types, constraints, or indexes. A schema gap must be closed by a separately reviewed migration. Backups hold personal data and are never pruned automatically.

### Releasing Invitations

The first release that contains Invitations (issue #47) has two steps that a code deploy alone does not cover.

1. Create the `Invitations` table before the release. Production does not run schema pushes, so review [`deploy/production/invitations.sql`](../deploy/production/invitations.sql) and run it once with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/production/invitations.sql`. It runs in one transaction and fails if the table already exists. `fit-check` stops `deploy` while the table is missing. If `src/drizzle/schema.ts` changes the table before this release, regenerate the file with `drizzle-kit export`.
2. Rebuild and push the worker image with the release. A worker built before this release ignores the `invitation` job, so Invitation emails are not delivered. `make -C deploy/production deploy` builds and recreates both `api` and `worker`. A release by any other route must do the same.

On staging, run `make -C deploy/staging migrate HOST=<ssh host>` before `deploy`, as for any change to `schema.ts`.

## Runtime and image construction

Bun is the application runtime and package manager. Its exact version is **unresolved and unpinned**:

- the Dockerfile uses `oven/bun:1` and `oven/bun:1-slim`;
- `package.json` does not declare `engines` or `packageManager`;
- some dependencies are requested with `latest`, although `bun.lock` records the current resolution.

The release image build performs these steps:

1. install dependencies with `bun install --frozen-lockfile`;
2. copy the repository build context;
3. compile `src/workers.ts` into the standalone native executable `worker-bin`;
4. copy `src/`, `worker-bin`, `seed_data/`, Drizzle config, package metadata, and `node_modules` into the slim runtime image;
5. run the API from `src/index.ts` so `elysia-autoload` can scan route files at runtime.

An explicit local release build has this shape:

```bash
docker build --target release -t <registry>/<repository>:<immutable-release-tag> .
```

The worker binary is native to its build platform. The build system must target every deployment CPU/OS platform intentionally or publish a verified multi-platform image.

## Production image resolution

The current production services use:

```text
rawinan/twhp-elysia-api:latest
```

`latest` is mutable, so Compose alone cannot prove which source revision is deployed. `deploy/production/Makefile` works around this: it pushes each release as `<short sha>` and `latest`, labels the image with the source revision, retags the running image as `previous` before switching, and appends each release to `releases.log` on the server. A release by any other route loses these guarantees. PostgreSQL is pinned only to major version 17; Redis is pinned only to major version 7; RustFS is pinned by digest; and Nginx uses the moving `alpine` tag.

The organization must still define vulnerability scanning, signing, and promotion. There is no CI/CD pipeline; releases run from a laptop through the Makefile.

## Production topology and ports

```text
postgres (healthy) --> migrate-prod (no-op) --> api (liveness) --> worker
redis (healthy) -------------------------------> api / worker
minio -------------------------------------------------------> nginx-backend-prod
api ---------------------------------------------------------> nginx-backend-prod
nginx-backend-prod <--> shared-web-network <--> external edge (not defined here)
```

| Component | Container port | Host binding | Notes |
| --- | ---: | --- | --- |
| API | 3000 | None | Nginx and health checks assume port 3000 |
| Nginx | 80 | `127.0.0.1:81` | Loopback only; public edge/TLS is external to this repository |
| PostgreSQL | 5432 | `5433` on all host interfaces | Restrict with host firewall/network policy |
| Redis | 6379 | `6380` on all host interfaces | No authentication or TLS is configured |
| RustFS S3 API (service `minio`) | 9000 | None | Proxied at `/twhp/files/` |
| RustFS console (service `minio`) | 9001 | None | Proxied at `/twhp/minio-console/`; expected not to work through this path |

`APP_PORT` must be **3000** in the current Compose deployment. Although it is configurable in application code, Docker health checks, Nginx upstreams, and the Dockerfile all assume 3000.

The API health endpoint is a static **liveness-only** response. It does not verify PostgreSQL, Redis, RustFS, SMTP, queue processing, or worker health. The worker has no Compose health check.

## Production database release is not implemented

`migrate-prod` is a successful no-op. Its command only prints an instruction not to migrate in production; it does not run Drizzle, import CSV, validate schema/data, take a backup, or implement rollback. The API starts after that echo exits successfully.

Production migration, import, verification, backup, and rollback ownership are **Unknown**. Do not interpret a successful `migrate-prod` container as evidence that the database is ready. A release cannot be considered repeatable until the organization assigns ownership and publishes an approved procedure.

`db:seed` is not a substitute: it contains development accounts, overwrites seeded credentials on rerun, and is unsuitable for production.

## Reverse proxy behavior

The staging/production Nginx template:

- requires `X-API-Key` for `/twhp/api/` and the RustFS console;
- denies the OpenAPI document path;
- proxies the API to `${NGINX_API_UPSTREAM}:3000`;
- permits `/twhp/files/` without the shared API key because S3 presigned signatures authorize object access;
- forwards host, client IP, forwarded-for, and forwarded-proto headers;
- allows request bodies up to `130m`.

The API itself accepts up to 130 MiB. Docker's internal health check talks directly to the API and bypasses Nginx/API-key enforcement.

The production Nginx service joins `shared-web-network`, which is declared external and must already exist. TLS termination, public DNS, the external edge proxy, certificate rotation, and ownership of that network are not defined in this repository.

## Environment variables

This inventory lists keys and safe shapes only. It does not reproduce values from `.env` or `docker.env`. “Required” describes current behavior; the eager `src/config.ts` import means API and worker processes validate settings they may not directly consume.

| Key | Requirement/default | Purpose and read site | Safe shape | Secret classification |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL connection; config, runtime Drizzle, Drizzle Kit, seed | PostgreSQL URL with user, password, host, port, database | Secret |
| `APP_PORT` | Required; must be 3000 in Compose | Elysia listen port; config and API entry point | Integer TCP port | Public configuration |
| `AUTH_JWT_SECRET` | Required | Access-token signing and verification; auth/JWT middleware | High-entropy random string | Secret |
| `AUTH_TOKEN_EXP` | Required | Access-token and cookie lifetime | Positive integer seconds | Public configuration |
| `REFRESH_JWT_SECRET` | Required | Refresh-token signing; current rotation fails to verify refresh signature/expiry (known Critical defect) | Independent high-entropy random string | Secret |
| `REFRESH_TOKEN_EXP` | Required | Refresh-token and cookie lifetime | Positive integer seconds | Public configuration |
| `COOKIE_SECURE` | Required | Cookie Secure flag and production guard for dev OTP bypass | Lowercase boolean literal | Public configuration |
| `REDIS_HOST` | Required | BullMQ/ioredis endpoint; queue, worker, utilities | DNS name or IP without scheme | Public configuration |
| `REDIS_PORT` | Required | BullMQ/ioredis endpoint | Integer TCP port | Public configuration |
| `SMTP_HOST` | Required | Nodemailer relay host | DNS name | Public configuration |
| `SMTP_PORT` | Required | Nodemailer relay port | Integer TCP port | Public configuration |
| `SMTP_STARTTLS` | Required but unused | Intended STARTTLS control; validated only | Lowercase boolean literal | Public configuration |
| `SMTP_SECURE` | Required but unused | Intended implicit-TLS control; validated only | Lowercase boolean literal | Public configuration |
| `SMTP_USER` | Required | SMTP authentication and From address | Provider account identifier | Sensitive |
| `SMTP_PASS` | Required | SMTP authentication | Provider password/token | Secret |
| `FRONTEND_URL` | Required | Base for password-reset and Invitation links | Absolute HTTPS URL | Public configuration |
| `OTP_CHALLENGE_TTL` | Optional; code default | OTP challenge lifetime | Positive integer seconds | Public configuration |
| `OTP_MAX_ATTEMPTS` | Optional; code default | Per-challenge attempt limit | Positive integer | Public configuration |
| `OTP_FAIL_WINDOW` | Optional; code default | Failure-count window | Positive integer seconds | Public configuration |
| `OTP_FAIL_THRESHOLD` | Optional; code default | Failure threshold in the window | Positive integer | Public configuration |
| `OTP_RESEND_THROTTLE` | Optional; code default | OTP resend cooldown | Positive integer seconds | Public configuration |
| `DEV_SKIP_OTP` | Optional; defaults disabled | Development OTP bypass switch; ignored with secure cookies | Lowercase boolean literal | Security-sensitive configuration |
| `DEV_BYPASS_SECRET` | Optional; defaults empty/fail-closed | Header secret for approved development bypass | High-entropy random string; unset outside approved dev | Secret |
| `EVALUATION_PERIOD_END` | Optional; defaults unset | Extends the evaluation period end for the current fiscal year; unset restores the 31-day rule | ISO 8601 instant with offset, e.g. `2027-01-01T00:00:00+07:00` | Public configuration |
| `MINIO_ENDPOINT` | Required | Internal S3 endpoint; utilities | DNS name or IP without scheme | Public configuration |
| `MINIO_PORT` | Required | Internal S3 endpoint | Integer TCP port | Public configuration |
| `MINIO_USE_SSL` | Required | Internal MinIO client TLS setting | Lowercase boolean literal | Public configuration |
| `MINIO_ACCESS_KEY` | Required | Application S3 identity | Access-key identifier | Sensitive |
| `MINIO_SECRET_KEY` | Required | Application S3 credential | High-entropy secret | Secret |
| `MINIO_BUCKET_NAME` | Required | Object bucket, created on first upload if absent | S3-compatible bucket name | Public configuration |
| `MINIO_PUBLIC_URL` | Required | Public proxy base used to rewrite presigned URLs | Absolute HTTPS URL with intended file path prefix | Public configuration |
| `POSTGRES_USER` | Compose/PostgreSQL image; must align with health and URL | Initializes database role | PostgreSQL identifier | Sensitive |
| `POSTGRES_PASSWORD` | Required by current PostgreSQL image setup | Initializes database credential | High-entropy secret | Secret |
| `POSTGRES_DB` | Compose/PostgreSQL image; must align with health and URL | Initializes database name | PostgreSQL identifier | Public configuration |
| `POSTGRES_DATABASE` | Unused/misnamed key found in `.env` | No current reader | Remove or rename only after owner review | Unknown |
| `NGINX_API_KEY` | Required by staging/production template | Validates `X-API-Key` | High-entropy random string | Secret |
| `NGINX_API_UPSTREAM` | Required by staging/production template | Docker DNS name for API upstream | Compose service name | Public configuration |
| `NODE_ENV` | Set by Dockerfile/API Compose; no application read found | Runtime convention | Recognized environment name | Public configuration |
| `TZ` | Set by Compose; not validated by app | Container timezone, including worker schedule | IANA timezone name | Public configuration |
| `RUSTFS_ACCESS_KEY` | Hard-coded in Compose, not sourced from env file; must equal `MINIO_ACCESS_KEY` | RustFS root identity | Managed admin identifier | Sensitive |
| `RUSTFS_SECRET_KEY` | Hard-coded in Compose, not sourced from env file; must equal `MINIO_SECRET_KEY` | RustFS root credential | High-entropy managed secret | Secret |
| `RUSTFS_CONSOLE_ENABLE` | Hard-coded in Compose | Enables the RustFS console | `true` or `false` | Public configuration |

### Validation caveats

- Required strings are checked only for presence/non-empty content.
- Boolean values accept only lowercase `true` or `false`.
- Numeric values reject `NaN` but do not enforce integer, positive, or port ranges.
- URL, hostname, identifier, and secret strength are not validated at startup.
- `MINIO_PUBLIC_URL` is parsed only while generating a presigned URL. The current rewrite clears an explicitly configured public port.
- `SMTP_STARTTLS` and `SMTP_SECURE` are validated but not supplied to `nodemailer.createTransport`; they currently have no effect.
- Drizzle Kit imports the full eager application configuration even though it directly reads only `DATABASE_URL`.
- `NGINX_API_KEY` is substituted directly into an Nginx `map`. If it renders empty, a request with no `X-API-Key` header can match the empty map entry and be accepted. Compose does not fail closed on an empty value.

## Production startup preconditions

The repository's current start command is:

```bash
docker compose --profile production up
```

Before executing it, operators must ensure:

1. `docker.env` is delivered through the approved secret-management process and contains all required keys.
2. `APP_PORT` is 3000.
3. The intended application image already exists in the registry; the current mutable `latest` reference has been explicitly accepted or replaced by an immutable release reference.
4. `shared-web-network` already exists and is attached to the intended external edge proxy.
5. The separately approved production database preparation/import has completed and been verified; `migrate-prod` will not do it.
6. Host firewall rules prevent unintended access to the published PostgreSQL and Redis ports.
7. RustFS root credentials have been externalized and rotated; Compose currently hard-codes them.
8. SMTP transport security has been verified independently of the unused TLS flags.
9. `NGINX_API_KEY` is non-empty and the rendered Nginx configuration has been inspected; reject startup when the substitution is empty.
10. An approved copy of `seed_data/` is present when building or seeding. The directory is ignored and absent from Git, so a clean clone is not reproducible without an out-of-band source.

## Release verification

Inspect service state and logs:

```bash
docker compose --profile production ps
docker compose --profile production logs api worker nginx-backend-prod
```

Verification must cover more than the liveness endpoint:

- API liveness directly and through Nginx with the required key;
- an authenticated database-backed request;
- PostgreSQL schema/data version checks from the approved database procedure;
- Redis queue submission and worker consumption;
- SMTP delivery through the intended secure transport;
- RustFS upload and presigned download through `/twhp/files/`;
- external DNS/TLS behavior and certificate validity;
- restart and rollback behavior using an immutable prior image.

## Unresolved operational ownership

The repository does not identify owners or procedures for:

- production database import, migration, backup, verification, and rollback;
- image build, scanning, signing, publication, promotion, and rollback;
- external proxy, `shared-web-network`, DNS, TLS, and certificates;
- secrets rotation;
- PostgreSQL, Redis, and RustFS backup/restore and retention;
- metrics, alerts, SLOs, queue failure monitoring, and worker health;
- production incident response and disaster recovery.

These items remain **Unknown** until the organization assigns ownership and records approved runbooks.

## Known deployment risks

| Severity | Verified condition | Required resolution |
| --- | --- | --- |
| Critical | `migrate-prod` is an echo-only no-op | Establish owned production database release and rollback procedure |
| Critical | Production Compose references mutable `latest`; only `deploy/production/Makefile` releases add commit tags and `previous` rollback | Release only through the Makefile, or pin Compose to an immutable tag/digest |
| High / Potential risk | RustFS root credentials are hard-coded; Redis has no auth/TLS; database and Redis ports bind broadly. Actual external reachability is Unknown. | Externalize/rotate secrets and restrict network exposure |
| High / Potential risk | An empty rendered `NGINX_API_KEY` can make the Nginx shared-key gate accept a missing header. Whether any deployed key is empty is Unknown. | Validate non-empty substitution and fail startup before traffic |
| High | No CI/CD pipeline; releases run from a laptop, with provenance only as an image revision label and `releases.log` | Define build, verification, publication, and deploy pipeline |
| High | Compose requires `APP_PORT=3000` despite configurable app code | Enforce the invariant or template every consumer |
| High | Health is liveness-only and worker has no health check | Define readiness, worker monitoring, and alerting |
| High | SMTP TLS flags are unused | Wire and test transport security or remove misleading settings |
| High | Staging uses the development runtime; the Compose `staging` profile also pushes schema and seeds, which the server's `compose.staging.yml` disables | Decide whether staging must mirror production |
| Medium | Bun and several images/dependency requests are not exactly pinned | Adopt toolchain and base-image pinning policy |
| Medium | Worker binary is platform-specific | Declare build platforms and verify multi-architecture releases |
| High | `seed_data/` is ignored/untracked although image build and seeding require it | Establish an authoritative protected source or change packaging |
