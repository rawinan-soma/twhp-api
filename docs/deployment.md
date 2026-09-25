# Deployment

This document describes the deployment behavior implemented by `Dockerfile`, `docker-compose.yaml`, and the Nginx configurations. It also records the operational gaps that must be resolved outside the current repository.

Verified 2026-07-15; re-checked 2026-09-02. `Dockerfile` and `docker-compose.yaml` were last changed on 2026-04-20 and `nginx/` on 2026-07-02, so every statement here stands unchanged. Nothing delivered since the original audit addressed the release, backup, rollback, or artifact-immutability gaps below.

For developer setup, see [Development](development.md). For persistence details, see [Database](database.md).

## Current deployment model

Docker Compose defines three profiles:

| Profile | Services | Current purpose |
| --- | --- | --- |
| `dev` | PostgreSQL, Redis, `migrate-dev`, `api-dev`, `worker-dev`, MinIO, development Nginx | Local development with build, hot reload, schema push, and seed |
| `staging` | PostgreSQL, Redis, `migrate-dev`, `api-dev`, `worker-dev`, MinIO, templated Nginx | Development-style runtime behind API-key Nginx and an external network |
| `production` | PostgreSQL, Redis, `migrate-prod`, API, worker, MinIO, production Nginx | Pulls a prebuilt application image and starts production services |

MinIO has no profile, so it is the only service selected by a plain `docker compose up` without a profile.

## Runtime and image construction

Bun is the application runtime and package manager. It is pinned to **1.4.2** in three places that must change together:

- the Dockerfile uses `oven/bun:1.4.2` (build) and `oven/bun:1.4.2-slim` (release);
- `.bun-version` at the repository root;
- `package.json` `engines.bun`.

No dependency is requested with `latest`; `elysia` and `bun-types` are exact, and `bun.lock` records the full resolution.

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

`latest` is mutable, so Compose alone cannot prove which source revision is deployed or provide deterministic rollback. PostgreSQL is pinned only to major version 17; Redis is pinned only to major version 7; MinIO uses `latest`; and Nginx uses the moving `alpine` tag.

Before a controlled production release, the organization must define immutable image tags or digests, artifact provenance, promotion, vulnerability scanning, and rollback. No CI/CD build, publish, deploy, or rollback manifest is present in this repository.

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
| MinIO API | 9000 | None | Proxied at `/twhp/files/` |
| MinIO console | 9001 | None | Proxied at `/twhp/minio-console/` |

`APP_PORT` must be **3000** in the current Compose deployment. Although it is configurable in application code, Docker health checks, Nginx upstreams, and the Dockerfile all assume 3000.

The API exposes two health endpoints (`src/routes/index.ts`, `src/service/health.ts`):

- `GET /twhp/api/health/live` — liveness. 200 whenever the process serves; checks no dependencies. `GET /twhp/api/health` is a kept alias that still returns `Ready to work!!`.
- `GET /twhp/api/health/ready` — readiness. Checks PostgreSQL (`select 1`), Redis (`PING`) and MinIO (a signed `HEAD` on the configured bucket) in parallel, each with a 1 s timeout. MinIO counts as `up` when it answers 200 or 404 with an `x-amz-request-id` header: a bucket that does not exist yet is fine, because the first upload creates it. Rejected credentials (403), any other status, or a non-S3 server on the MinIO endpoint count as `down`. 200 `{ "status": "ready", "checks": { "postgres": "up", "redis": "up", "minio": "up" } }` when all pass, otherwise 503 with `"status": "not_ready"` and the failing checks `"down"`. It never returns error messages or hostnames.

The Compose healthchecks for `api` and `api-dev` call `/health/live`, **not** `/health/ready`, so a dependency blip does not mark the API unhealthy or restart it. Readiness does not cover SMTP, queue processing, or the worker, and the worker has no Compose health check. All three health paths are excluded from request logs.

## Production database release is not implemented

`migrate-prod` is a successful no-op. Its command only prints an instruction not to migrate in production; it does not run Drizzle, import CSV, validate schema/data, take a backup, or implement rollback. The API starts after that echo exits successfully.

Production migration, import, verification, backup, and rollback ownership are **Unknown**. Do not interpret a successful `migrate-prod` container as evidence that the database is ready. A release cannot be considered repeatable until the organization assigns ownership and publishes an approved procedure.

`db:seed` is not a substitute: it contains development accounts, overwrites seeded credentials on rerun, and is unsuitable for production.

## Reverse proxy behavior

The staging/production Nginx template:

- requires `X-API-Key` for `/twhp/api/` and the MinIO console;
- denies the OpenAPI document path;
- proxies the API to `${NGINX_API_UPSTREAM}:3000`;
- permits `/twhp/files/` without the shared API key because MinIO presigned signatures authorize object access;
- forwards host, client IP, forwarded-for, and forwarded-proto headers;
- allows request bodies up to `130m`.

The API itself accepts up to 130 MiB. Docker's internal health check talks directly to the API and bypasses Nginx/API-key enforcement.

The production Nginx service joins `shared-web-network`, which is declared external and must already exist. TLS termination, public DNS, the external edge proxy, certificate rotation, and ownership of that network are not defined in this repository.

## Observability

An opt-in `observability` Compose profile adds Alloy, Loki, Tempo, Prometheus and Grafana, plus
`node-exporter` for host metrics. It combines with any other profile:

```bash
docker compose --profile dev up                        # dev, no observability services
docker compose --profile dev --profile observability up -d      # dev + observability
docker compose --profile staging --profile observability up -d  # staging + observability
```

The Compose project name is pinned to `twhp-elysia` (top of `docker-compose.yaml`) so Alloy's
container filter, and named volumes, stay stable no matter which directory or git worktree the
repository is checked out into.

| Service | Role | Exposure | Data |
| --- | --- | --- | --- |
| `alloy` | Tails this Compose project's container logs to Loki; receives OTLP traces on 4318 and forwards to Tempo, stripping header/cookie/query span attributes first | Docker network only | `alloy_data` volume (positions, WAL) |
| `loki` | Log storage, 90-day retention (`retention_period: 2160h`, compactor-enforced) | Docker network only | `loki_data` volume |
| `tempo` | Trace storage, 7-day retention (`block_retention: 168h`) | Docker network only | `tempo_data` volume |
| `prometheus` | Scrapes metrics every 15 s, 30-day retention (`--storage.tsdb.retention.time=30d`) | Docker network only | `prometheus_data` volume |
| `grafana` | Explore UI, alerting (dashboards land in a later issue) | **`127.0.0.1:3001`** only | `grafana_data` volume |
| `node-exporter` | Host CPU/RAM/disk, via host `/` mounted read-only | Docker network only | none |

Config lives under `observability/` (`alloy/config.alloy`, `loki/loki-config.yaml`,
`tempo/tempo-config.yaml`, `prometheus/prometheus.yml`, `grafana/provisioning/`).

### Secrets

The profile reads `observability.env` (gitignored; copy from `observability.env.example`), never
`docker.env` — the app containers (`api`, `api-dev`, `worker`, `worker-dev`) never see the Grafana
admin password or the Discord webhook used by alerting. It carries:

- `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD` — Grafana admin login. Anonymous access
  and sign-up are disabled unconditionally in `docker-compose.yaml`.
- `DEPLOYMENT_ENV` — the `env` label Alloy attaches to every log line; keep it in sync with the
  same key in `docker.env`.
- `MINIO_PROMETHEUS_TOKEN` — a bearer token for Prometheus to scrape MinIO's authenticated
  `/minio/v2/metrics/cluster`. Generate it against the running MinIO with (`mc`'s own Prometheus
  helper — see MinIO's Prometheus docs):
  ```bash
  docker run --rm --network twhp-elysia_default quay.io/minio/mc \
    alias set target http://minio:9000 <MINIO_ROOT_USER> <MINIO_ROOT_PASSWORD>
  docker run --rm --network twhp-elysia_default quay.io/minio/mc \
    admin prometheus generate target
  ```
  Copy only the `bearer_token` value into `MINIO_PROMETHEUS_TOKEN`; the Prometheus container writes
  it to a file at startup and never commits it to a config file.
- `DISCORD_WEBHOOK_URL` — reserved for Grafana alert notifications (wired up alongside dashboards
  and alert rules in a later issue).

### App wiring

`api`, `api-dev`, `worker` and `worker-dev` get `OTEL_EXPORTER_OTLP_ENDPOINT` (default
`http://alloy:4318`) and `DEPLOYMENT_ENV` (default `development`/`production`) from the
`environment:` block in `docker-compose.yaml`, overridable via a top-level `.env` file or the shell
environment. With the `observability` profile off, `alloy` doesn't resolve on the Docker network;
the API still serves normally: spans are exported in the background and failed exports are dropped
silently. Unset `OTEL_EXPORTER_OTLP_ENDPOINT` to stop export entirely — spans, `X-Request-Id` and
log `trace_id` keep working. The API commands preload `src/telemetry.api.ts`; without it the API
still traces requests but logs a warning and has no PostgreSQL spans. Every API response except the
health routes carries `X-Request-Id`, its trace ID: paste it into Grafana → Explore → Tempo.

### Docker socket access

Alloy mounts `/var/run/docker.sock` **read-only** to discover containers and tail their logs. This
is still root-equivalent access to the host's Docker daemon — a compromised Alloy container can
read the config, environment and logs of every other container on the host, and read (though not
write, given the read-only mount) daemon state. Treat the `observability` profile as trusted
infrastructure, not something to expose to less-trusted operators.

### Access

Grafana is reachable only at `127.0.0.1:3001` on the host — never published beyond loopback and
never proxied by Nginx. To reach it from another machine, use an SSH tunnel:

```bash
ssh -L 3001:127.0.0.1:3001 <host>
```

Then open `http://localhost:3001`. In Explore, the Loki datasource has a derived field that turns a
log line's `trace_id` into a link to the matching Tempo trace; Tempo's datasource is configured with
trace-to-logs back to Loki.

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
| `FRONTEND_URL` | Required | Base for password-reset links | Absolute HTTPS URL | Public configuration |
| `OTP_CHALLENGE_TTL` | Optional; code default | OTP challenge lifetime | Positive integer seconds | Public configuration |
| `OTP_MAX_ATTEMPTS` | Optional; code default | Per-challenge attempt limit | Positive integer | Public configuration |
| `OTP_FAIL_WINDOW` | Optional; code default | Failure-count window | Positive integer seconds | Public configuration |
| `OTP_FAIL_THRESHOLD` | Optional; code default | Failure threshold in the window | Positive integer | Public configuration |
| `OTP_RESEND_THROTTLE` | Optional; code default | OTP resend cooldown | Positive integer seconds | Public configuration |
| `DEV_SKIP_OTP` | Optional; defaults disabled | Development OTP bypass switch; ignored with secure cookies | Lowercase boolean literal | Security-sensitive configuration |
| `DEV_BYPASS_SECRET` | Optional; defaults empty/fail-closed | Header secret for approved development bypass | High-entropy random string; unset outside approved dev | Secret |
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
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional; unset/empty exports nothing. Set by Compose (`api`/`api-dev`/`worker`/`worker-dev`), default `http://alloy:4318` | OTLP/HTTP base URL the API exports traces to (`/v1/traces` appended); read by config and `src/telemetry.api.ts`. The worker does not read it yet (issue 06) | Absolute http(s) URL; anything else fails startup | Public configuration |
| `DEPLOYMENT_ENV` | Optional, default `development`; Compose sets `development`/`production` | `deployment.environment` on every API span; also drives Alloy's log `env` label | Recognized environment name | Public configuration |
| `MINIO_ROOT_USER` | Hard-coded in Compose, not sourced from env file | MinIO root identity | Managed admin identifier | Sensitive |
| `MINIO_ROOT_PASSWORD` | Hard-coded in Compose, not sourced from env file | MinIO root credential | High-entropy managed secret | Secret |
| `MINIO_BROWSER_REDIRECT_URL` | Hard-coded in Compose | MinIO console redirect base | Absolute HTTPS URL | Public configuration |

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
7. MinIO root credentials have been externalized and rotated; Compose currently hard-codes them.
8. SMTP transport security has been verified independently of the unused TLS flags.
9. `NGINX_API_KEY` is non-empty and the rendered Nginx configuration has been inspected; reject startup when the substitution is empty.
10. `MINIO_BROWSER_REDIRECT_URL` is set for the real external URL; the checked-in Compose value redirects remote users to `localhost`.
11. An approved copy of `seed_data/` is present when building or seeding. The directory is ignored and absent from Git, so a clean clone is not reproducible without an out-of-band source.

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
- MinIO upload and presigned download through `/twhp/files/`;
- external DNS/TLS behavior and certificate validity;
- restart and rollback behavior using an immutable prior image.

## Unresolved operational ownership

The repository does not identify owners or procedures for:

- production database import, migration, backup, verification, and rollback;
- image build, scanning, signing, publication, promotion, and rollback;
- external proxy, `shared-web-network`, DNS, TLS, and certificates;
- secrets rotation;
- PostgreSQL, Redis, and MinIO backup/restore and retention;
- metrics, alerts, SLOs, queue failure monitoring, and worker health;
- production incident response and disaster recovery.

These items remain **Unknown** until the organization assigns ownership and records approved runbooks.

## Known deployment risks

| Severity | Verified condition | Required resolution |
| --- | --- | --- |
| Critical | `migrate-prod` is an echo-only no-op | Establish owned production database release and rollback procedure |
| Critical | Application production image uses mutable `latest` | Adopt immutable tags/digests and promotion/rollback policy |
| High / Potential risk | MinIO root credentials are hard-coded; Redis has no auth/TLS; database and Redis ports bind broadly. Actual external reachability is Unknown. | Externalize/rotate secrets and restrict network exposure |
| High / Potential risk | An empty rendered `NGINX_API_KEY` can make the Nginx shared-key gate accept a missing header. Whether any deployed key is empty is Unknown. | Validate non-empty substitution and fail startup before traffic |
| High | No CI/CD or artifact provenance manifests | Define build, verification, publication, and deploy pipeline |
| High | Compose requires `APP_PORT=3000` despite configurable app code | Enforce the invariant or template every consumer |
| High | Health is liveness-only and worker has no health check | Define readiness, worker monitoring, and alerting |
| High | SMTP TLS flags are unused | Wire and test transport security or remove misleading settings |
| High | Staging uses development runtime and automatic seed | Decide whether staging must mirror production |
| Medium | Bun and several images/dependency requests are not exactly pinned | Adopt toolchain and base-image pinning policy |
| Medium | Worker binary is platform-specific | Declare build platforms and verify multi-architecture releases |
| High | `seed_data/` is ignored/untracked although image build and seeding require it | Establish an authoritative protected source or change packaging |
| Medium | MinIO console redirect is hard-coded to localhost | Configure the external console URL per environment |
