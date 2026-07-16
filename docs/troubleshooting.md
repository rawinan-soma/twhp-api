# Troubleshooting and Operations Runbook

This maintainer runbook is based on repository behavior verified on 2026-07-15. It does not claim that any described failure has occurred. No production system, live database, SMTP server, Redis queue, or MinIO deployment was queried; current deployed state is **Unknown**.

## Evidence vocabulary and safety boundary

- **Verified**: directly supported by source, checked configuration, existing draft evidence, or a non-mutating local command.
- **Inferred**: a likely operational outcome from the verified code/configuration, but not reproduced against a running target environment.
- **Unknown**: requires live deployment, infrastructure, secret-store, product-policy, or ownership information that is absent from the repository.
- Commands below are diagnostic unless explicitly labelled as a recovery action. Substitute the correct Compose profile (`dev`, `staging`, or `production`). Do not paste secrets, JWTs, OTP values, reset tokens, cookie values, presigned URLs, or full `DATABASE_URL` values into tickets or shared logs.
- Before any destructive data or object repair, take a backup/snapshot and record the affected account, Cover, Answer, database rows, and MinIO object names. There is no repository-defined production rollback or object-reconciliation procedure.

## Fast triage sequence

1. Identify the target profile and request path: direct application, development nginx, staging/production nginx, or an outer proxy.
2. Capture status without restarting anything:

   ```bash
   docker compose --profile <profile> ps
   docker compose --profile <profile> logs --since=15m api api-dev worker worker-dev migrate-dev migrate-prod nginx-backend nginx-backend-stg nginx-backend-prod postgres redis minio
   ```

   Compose ignores services not in the selected profile, so warnings for absent service names can be disregarded after confirming the profile.

3. Probe liveness through the same edge used by the client. Development nginx is bound only to host loopback port 81; staging/production nginx additionally requires the configured `X-API-Key`:

   ```bash
   curl -i http://127.0.0.1:81/twhp/api/health
   curl -i -H 'X-API-Key: <redacted>' http://127.0.0.1:81/twhp/api/health
   docker exec twhp-api-dev bun -e "fetch('http://127.0.0.1:3000/twhp/api/health').then(async r => console.log(r.status, await r.text())).catch(console.error)"
   docker exec twhp-api-prod bun -e "fetch('http://127.0.0.1:3000/twhp/api/health').then(async r => console.log(r.status, await r.text())).catch(console.error)"
   ```

4. Treat a 200 health response only as API-process reachability. `GET /twhp/api/health` returns the constant string `Ready to work!!`; it does not query PostgreSQL, Redis, MinIO, SMTP, BullMQ, or the worker (`src/routes/index.ts`).
5. Classify the failure before recovery: startup/configuration, edge/network, authentication/authorization, validation/contract, database, Redis/queue, worker/SMTP, or MinIO. Avoid blanket restarts: they can hide import errors, preserve bad Redis challenge state, replay retained jobs, or compound cross-store inconsistencies.

## 1. API or worker exits immediately at startup

**Classification:** Verified configuration behavior; exact incident cause Unknown.

**Symptom**

- Process exits before the Elysia startup line or before `Workers running....`.
- Logs contain `Missing environment variable: ...`, `must be a number`, or `must be "true" or "false"`.
- `db:push` fails while complaining about an unrelated SMTP, JWT, Redis, or MinIO variable.

**Likely causes**

- `src/config.ts` eagerly validates the complete environment at import time. API, worker, and—because of an unused import in `drizzle.config.ts`—Drizzle Kit require all application settings, not only the dependency they immediately use.
- Required groups are `DATABASE_URL`, `APP_PORT`, access/refresh JWT secrets and numeric expiries, `COOKIE_SECURE`, Redis host/port, SMTP host/port/booleans/user/pass, `FRONTEND_URL`, and all MinIO values. OTP controls and development bypass values are optional.
- Numeric parsing rejects non-numbers but permits values that may still be operationally invalid, such as zero or out-of-range ports. Boolean parsing accepts only the exact lowercase strings `true` and `false`.
- Route/service imports initialize global Redis, BullMQ, and MinIO clients. An import-time dependency or package-resolution error can therefore stop bootstrap before `listen`.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> ps -a
docker compose --profile <profile> logs --tail=200 api api-dev worker worker-dev migrate-dev
docker compose --profile <profile> config --services
bun --version
bun install --frozen-lockfile --dry-run
```

- Inspect names, not secret values, in `.env`/`docker.env`; compare them to `src/config.ts`.
- Relevant paths: `src/config.ts`, `src/index.ts`, `src/workers.ts`, `src/utils.ts`, `src/queue/email.ts`, `drizzle.config.ts`, `package.json`, `Dockerfile`, `docker-compose.yaml`.

**Safe resolution**

- Correct the environment source for the target process and recreate only the affected container. Keep access and refresh secrets distinct and do not replace secrets merely to clear a startup failure; unplanned replacement invalidates sessions.
- Use `docker compose --profile dev up --build` after dependency, schema, or image-input changes. The documented dev path requires `--build` when cached `twhp-api:dev` content is stale.
- If a clean install fails, preserve `bun.lock` and investigate the exact dependency/import error. Do not regenerate the lock or install a new dependency without maintainer approval.

**Escalate when**

- The required value is owned by a secret manager or production platform; a JWT/SMTP/MinIO credential may be compromised; startup still fails with validated names/types; or resolving it would require dependency, schema, or secret rotation changes.

## 2. API is unhealthy, unreachable, or “healthy” while features fail

**Classification:** Verified health implementation and Compose behavior; network path/live readiness Unknown.

**Symptom**

- Compose reports `unhealthy`; nginx returns 502/504; direct health works but login, lists, uploads, or email fail.

**Likely causes**

- API Compose health checks are hard-coded to `localhost:3000`, while the application listens on `APP_PORT`. `Dockerfile` also exposes 3000. Any target configuration with `APP_PORT != 3000` makes the health check inaccurate.
- The process is reachable but a dependency is not: the static health route does not exercise any dependency.
- API Compose depends on Redis and the migration one-shot, but not directly on PostgreSQL or MinIO health. Worker starts only after API health. Nginx uses start-order `depends_on`, not dependency readiness for MinIO.
- The API has no host port mapping; normal Docker access is through nginx on `127.0.0.1:81` or through an external shared-network proxy.

**Diagnostic steps, evidence, and commands**

```bash
docker inspect --format '{{json .State.Health}}' twhp-api-dev
docker inspect --format '{{json .State.Health}}' twhp-api-prod
docker compose --profile <profile> logs --tail=200 nginx-backend nginx-backend-stg nginx-backend-prod api api-dev
docker exec twhp-nginx nginx -T
docker network inspect twhp-elysia_default
```

- Confirm `APP_PORT` matches the hard-coded container check without printing unrelated environment values.
- Relevant paths: `src/routes/index.ts`, `src/index.ts`, `docker-compose.yaml`, `Dockerfile`, `nginx/nginx.conf*`.

**Safe resolution**

- Restore the expected port/path/upstream configuration, recreate the affected API/nginx container, and then test dependency-specific functions separately.
- Do not declare an incident recovered solely from `/health`; verify one read-only PostgreSQL-backed endpoint, Redis/queue state, MinIO access if relevant, and worker/SMTP status for the failed workflow.

**Escalate when**

- The outer proxy/shared network is not repository-owned, `APP_PORT` intentionally differs from 3000, health semantics need redesign, or the process is live but a production dependency remains unavailable.

## 3. PostgreSQL connection, schema, or startup migration failure

**Classification:** Verified repository lifecycle; live schema and production lifecycle Unknown.

**Symptom**

- `ECONNREFUSED`, authentication/database-not-found errors, missing table/column/enum errors, `migrate-dev` fails, or API returns generic 500 on a database-backed route.

**Likely causes**

- Inside Compose, `DATABASE_URL` must use container DNS/port (normally `postgres:5432`), not host-published `localhost:5433`. From the host, Compose PostgreSQL is published at 5433.
- The PostgreSQL health check is fixed to user `admin` and database `twhp`, while container creation is controlled by `POSTGRES_USER`/`POSTGRES_DB`; changing those values without updating the health check produces false unhealthy status.
- Development/staging `migrate-dev` runs `db:push && db:seed`; API waits for successful completion. `db:push` uses schema convergence, not migration files.
- Production `migrate-prod` only prints `do not migrate in production, import csv directly`; repository Compose does not apply schema or import data in production. Production schema parity is not established by startup.
- Schema changes may be absent from the cached dev image unless Compose is rebuilt.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> ps postgres migrate-dev migrate-prod api api-dev
docker compose --profile <profile> logs --tail=300 postgres migrate-dev migrate-prod api api-dev
# The next command reproduces the checked-in health-check assumption only:
docker exec twhp-postgres pg_isready -U admin -d twhp
# Probe the actual configured container identity without printing its values:
docker exec twhp-postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker exec twhp-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select current_database(), current_user, current_setting('"'"'TimeZone'"'"'), version();"'
docker exec twhp-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\dt"'
```

- For a suspected enum/catalog mismatch, compare the live catalog to `src/drizzle/schema.ts`; quote mixed-case enum names in raw SQL.
- Relevant paths: `src/drizzle/index.ts`, `src/drizzle/schema.ts`, `drizzle.config.ts`, `docker-compose.yaml`, and [Database and persistence](./database.md).

**Safe resolution**

- In disposable development only, correct connectivity/config and rerun `docker compose --profile dev up --build`. Review the `db:push` plan before accepting destructive DDL.
- In staging/production, take a backup and use the deployment owner’s approved schema/import procedure. Do not run `db:push`, `db:seed`, `down -v`, or ad-hoc DDL as a troubleshooting shortcut.
- If the database is temporarily unavailable, restore it first; API restart alone does not repair schema or data.

**Escalate when**

- Any live drift, destructive DDL, enum conversion, failed partial deployment, missing backup/PITR, production import, grant/SSL issue, or unexplained data inconsistency is involved. The production schema/import/rollback procedure is a documented repository gap.

## 4. Seed fails, partially applies, or unexpectedly changes staff access

**Classification:** Verified seed behavior; affected live data Unknown.

**Symptom**

- `migrate-dev` stops during seed; reference records are incomplete; unique/FK errors occur; seeded staff passwords revert after a restart/deploy.

**Likely causes**

- Seed reads `seed_data/` relative to the process working directory and inserts in FK order. Missing/malformed CSV/JSON or mismatched standard enum values fail the run.
- A clean Git clone does not contain `seed_data/`: `.gitignore` excludes it and Git tracks no files there. Build and seed therefore require an approved out-of-band copy.
- The overall seed is not one transaction. Provincial/evaluator account rows can commit before subtype rows fail, leaving partial state.
- Reruns bcrypt-hash and overwrite every seeded Provincial/Evaluator password. A fixed development DOED account is also upserted. This is unsafe for staging/production-like environments.
- Upserts preserve rows removed from source files and can hit the separate unique email constraint when username/email ownership conflicts.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile dev logs --tail=400 migrate-dev postgres
docker run --rm --entrypoint sh twhp-api:dev -c 'pwd; find seed_data -maxdepth 1 -type f -print'
```

- Compare stage markers (`Provinces seeded`, `Districts seeded`, and so on) to locate the last completed unit.
- Query counts and orphan/mismatched account subtypes read-only before rerunning. Use [Database and persistence](./database.md) for expected checked fixture counts, but verify the target’s intended dataset with its owner.
- Relevant paths: `src/drizzle/seed.ts`, `seed_data/`, `src/drizzle/schema.ts`, `docker-compose.yaml`.

**Safe resolution**

- For disposable dev, obtain the authoritative approved `seed_data/` copy, correct the source/config conflict, and rerun the seed after inspecting partial state. Do not improvise the dataset.
- For any shared environment, snapshot first and reconcile the exact partial batches; do not repeatedly rerun seed because it resets seeded staff credentials and is not an exact mirror.

**Escalate when**

- Seed was run against staging/production, credentials changed unexpectedly, FK/unique conflicts indicate pre-existing business data, or cleanup would delete/merge accounts.

## 5. Redis unavailable or authentication state behaves inconsistently

**Classification:** Verified Redis use/configuration; live persistence/HA Unknown.

**Symptom**

- Login/reset calls hang or return 500, worker cannot connect, OTP challenges disappear, or resend/failure throttles appear inconsistent.

**Likely causes**

- Auth uses a process-global `ioredis` connector; BullMQ opens separate connections to the same host/port. Repository config supports no Redis password, TLS, or database number.
- Inside Compose the expected endpoint is service DNS `redis:6379`; host access is published at 6380. `localhost:6380` is wrong from another container.
- Redis restart/data loss removes OTP/reset state even if a queued email is later delivered. Conversely, Redis challenge/reset keys are written before queue add, so enqueue failure can leave a live throttle/challenge with no delivered message.
- Compose persists `/data` in `redis_data`, but actual Redis durability, eviction policy, backups, memory limits, and production HA are Unknown.

**Diagnostic steps, evidence, and commands**

```bash
docker exec twhp-redis redis-cli ping
docker exec twhp-redis redis-cli INFO server
docker exec twhp-redis redis-cli INFO memory
docker exec twhp-redis redis-cli INFO persistence
docker exec twhp-redis redis-cli --scan --pattern '2fa:*'
docker exec twhp-redis redis-cli --scan --pattern 'reset_password_token:*'
docker exec twhp-redis redis-cli --scan --pattern 'bull:email:*'
```

- Inspect key type and TTL, not OTP/reset contents: `TYPE <key>` and `TTL <key>`. Avoid dumping challenge values or job payloads because they can contain OTPs, reset tokens, and email addresses.
- Relevant paths: `src/utils.ts`, `src/queue/email.ts`, `src/service/authentication.ts`, `docker-compose.yaml`.

**Safe resolution**

- Restore Redis connectivity/persistence first. For a single affected user, allow the existing TTL/throttle to expire or use the documented resend/login flow.
- Delete authentication keys only with incident-owner approval and only for the exact account/challenge; broad `FLUSH*`, wildcard deletion, or deleting BullMQ keys manually can invalidate all sessions-in-progress or corrupt queue state.

**Escalate when**

- Redis reports persistence corruption, eviction/OOM, unexplained restart, external exposure, suspected data disclosure, queue-key inconsistency, or production HA/failover action is required.

## 6. OTP or password-reset email never arrives

**Classification:** Verified workflow/retry behavior; provider delivery state Unknown.

**Symptom**

- Login step one returns `twoFactorRequired`, or reset request succeeds, but no message arrives; resend returns 429; OTP arrives after it has expired.

**Likely causes**

- API success means Redis state was created and the BullMQ job was accepted, not that SMTP delivered it.
- Worker is a separate process. OTP/reset delivery does not occur if `worker`/`worker-dev` is absent, unhealthy, or waiting on API health.
- OTP and reset jobs request three attempts with five-second backoff and keep up to ten failed jobs. Challenge/reset TTL is normally 300 seconds; OTP resend is normally throttled for 60 seconds.
- SMTP credentials, DNS, outbound network, sender policy, spam filtering, or provider throttling may reject delivery.
- `SMTP_STARTTLS` and `SMTP_SECURE` are required/validated but ignored by the current Nodemailer transporter. Actual TLS negotiation follows Nodemailer/default/provider behavior, not those flags.
- Challenge/reset state is stored before enqueue. An enqueue failure can leave a throttle; a delayed successful job may arrive after the challenge expires.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> ps worker worker-dev redis api api-dev
docker compose --profile <profile> logs --since=30m worker worker-dev api api-dev redis
docker exec twhp-redis redis-cli --scan --pattern 'bull:email:*'
```

- Correlate timestamps: API challenge creation, BullMQ waiting/active/failed state, worker `Failed to send ...` output, and TTL remaining. Do not log the OTP code, reset token, queue payload, or recipient’s full personal data.
- Relevant paths: `src/service/authentication.ts`, `src/queue/email.ts`, `src/worker/email.ts`, `src/workers.ts`, `src/config.ts`.

**Safe resolution**

- Start/restore exactly one intended worker deployment, correct SMTP connectivity/credentials through the deployment secret owner, then use the normal resend or restart-login flow after throttle expiry.
- Do not claim delivery from a 200 response or blindly copy OTP/reset data from Redis/queue into chat. Do not manually replay an expired OTP job; issue a fresh challenge.

**Escalate when**

- Failed jobs persist after configured attempts, SMTP rejects sender/auth/TLS, multiple recipients are affected, delivery latency exceeds challenge TTL, or replay/personal-data access is needed.

## 7. Worker or scheduled daily reminder is missing, duplicated, or stuck

**Classification:** Verified implementation; replica count, monitoring, and deployment schedule Unknown.

**Symptom**

- No transactional emails; daily pending-factory reminder does not run at expected time; duplicate reminder/result messages; worker repeatedly restarts.

**Likely causes**

- `src/workers.ts` starts the email worker by import side effect and registers repeat job `factory-validation-reminder` with cron `30 8 * * *` and a fixed job ID.
- No explicit BullMQ timezone is configured. Compose sets worker container `TZ=Asia/Bangkok`; direct host execution follows host timezone.
- Production runs compiled `./worker-bin`; development runs source with `bun run worker`. A stale image can therefore contain stale worker logic.
- Reminder processing queries PostgreSQL via `adminService`; it needs DB connectivity in addition to Redis/SMTP.
- Unknown job names return `unknown job name` as success rather than failing. Worker logging is unstructured `console.*`; no repository dashboard, failed/stalled event hooks, dead-letter process, or alerting exists.
- Verdict-result and daily-reminder jobs use default single-attempt behavior; only OTP/reset producers configure retries. Finalize is not idempotent and can enqueue duplicate verdict emails if repeated.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> ps worker worker-dev api api-dev redis postgres
docker compose --profile <profile> logs --since=24h worker worker-dev
docker exec twhp-workers date
docker exec twhp-workers-dev date
docker exec twhp-redis redis-cli --scan --pattern 'bull:email:*repeat*'
```

- Confirm intended worker replica count and image digest before restarting or scaling. Inspect failed job metadata with an approved BullMQ tool; redact payloads.
- Relevant paths: `src/workers.ts`, `src/worker/email.ts`, `src/queue/email.ts`, `src/service/evaluator-review.ts`, `docker-compose.yaml`, `Dockerfile`.

**Safe resolution**

- Restore the approved single/multi-replica topology and correct timezone/image/config. Replay only an identified, still-relevant failed job after checking whether the side effect already happened.
- For “finalize succeeded but no email,” regard the database/latest `CoverLogs` state as authoritative. Inspect for a verdict job; do not call finalize again because it can append another transition and enqueue another email.

**Escalate when**

- Replica ownership is unclear, jobs are stalled/corrupt, repeat metadata duplicates, result email must be replayed, a deployment image is stale, or delivery guarantees/retry policy need a code/product decision.

## 8. MinIO upload, delete, or presigned-file access fails

**Classification:** Verified implementation and proxy mapping; live bucket/object state Unknown.

**Symptom**

- Upload/update returns 500; finalize reports `failed to delete rejected answer files; finalize aborted`; presigned URL is 404/403/signature-expired; URL points to an internal hostname or wrong path.

**Likely causes**

- API connects using `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, and application credentials. Inside Compose the endpoint should resolve to `minio`; MinIO is not directly host-published in repository Compose.
- First upload checks/creates `MINIO_BUCKET_NAME`; permission or race/network failures surface as request errors.
- Database stores UUID filenames, not full URLs. `getPresignedUrl` signs for **5 seconds**, despite route prose saying five minutes, then rewrites scheme/host/path from `MINIO_PUBLIC_URL`.
- Nginx serves `/twhp/files/...`, rewrites it to `/twhp/...`, and proxies to `minio:9000`. A mismatched public base path, clock skew, host/signature assumptions, or outer proxy rewrite breaks the URL.
- MinIO/SMTP clients have no application-level timeout configuration. Nginx file paths set a 300-second connect timeout but no general end-to-end policy.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> ps minio nginx-backend nginx-backend-stg nginx-backend-prod api api-dev
docker compose --profile <profile> logs --since=30m minio nginx-backend nginx-backend-stg nginx-backend-prod api api-dev
docker exec twhp-minio curl -fsS http://127.0.0.1:9000/minio/health/live
docker exec twhp-nginx nginx -T
date -u
docker exec twhp-minio date -u
```

- Compare one affected DB filename to object existence through an approved read-only MinIO client. Do not put a full presigned URL in tickets: its query carries a temporary signature.
- Relevant paths: `src/utils.ts`, `src/service/file.ts`, `src/routes/file/index.ts`, `src/service/answer.ts`, `src/service/enroll.ts`, `src/service/evaluator-review.ts`, `nginx/nginx.conf*`, `docker-compose.yaml`.

**Safe resolution**

- Correct endpoint/public-base/proxy/clock configuration, then generate a fresh presigned URL from the stored filename. Never persist or reuse a presigned URL.
- If strict deletion failed during finalize, that call writes no Cover transition; restore MinIO and compare all candidate objects before retrying.
- For failed create/update, reconcile database references and objects before user retry. Upload occurs before DB writes, while replacement paths may delete the old object before DB commit; either orphaned objects or missing referenced objects are possible.

**Escalate when**

- Object/database state differs, a production object needs restore/delete, bucket policy/credential rotation is needed, clock/proxy ownership is external, or the five-second lifetime must change. There is no built-in garbage collector or reconciliation command.

## 9. Authentication returns 401 or cookies appear not to stick

**Classification:** Verified cookie/middleware behavior; browser topology and live session state Unknown.

**Symptom**

- Login succeeds but next protected request is 401; response says `unauthorized` or `session expired`; cookies are absent; an older device loses its session.

**Likely causes**

- Browser/client did not store/send `Authentication` and `Refresh` cookies. Both are HTTP-only, `SameSite=Lax`, path `/`, with `Secure` controlled by `COOKIE_SECURE`.
- `COOKIE_SECURE=true` over plain HTTP prevents normal browser cookie use. Cross-origin browser calls need compatible origin/CORS/credential behavior, but the app defines no CORS policy; actual frontend/API topology is Unknown.
- Access verification failure falls back to Refresh. Refresh lookup reads PostgreSQL and compares its SHA-256 to the one hash stored for that account. A newer login/rotation replaces the stored hash, invalidating older refresh cookies.
- Current refresh flow does **not** cryptographically verify refresh JWT signature/expiry before hash lookup. This is a verified security defect, not a recovery feature; do not work around session failures by extending or copying tokens.
- Some invalid refresh paths return `session expired`; exception paths also clear both cookies.

**Diagnostic steps, evidence, and commands**

- In browser developer tools, inspect cookie attributes and whether the request includes cookies; never copy values into logs.
- Compare client scheme/domain/path to `COOKIE_SECURE`, proxy `X-Forwarded-Proto`, and frontend deployment topology.
- Check API logs/status and PostgreSQL connectivity; refresh is DB-backed.
- Use a new private session and a normal login to separate client-cookie handling from existing-session state.
- Correlate with server-side status without printing cookie values:

  ```bash
  docker compose --profile <profile> logs --since=15m api api-dev nginx-backend nginx-backend-stg nginx-backend-prod
  ```

- Relevant paths: `src/service/authentication.ts`, `src/middleware/jwt.ts`, `src/routes/authentication/index.ts`, `nginx/nginx.conf*`, and [Authentication and authorization](./authentication-authorization.md).

**Safe resolution**

- Correct HTTPS/origin/client credential handling, then perform a fresh login. Use logout where possible; do not edit cookie/JWT contents or manually alter `hashed_refresh_token`.
- Development OTP bypass applies only when explicitly enabled, `COOKIE_SECURE=false`, and the header secret matches. It must never be enabled as production recovery.

**Escalate when**

- Multiple users lose sessions, secret rotation or stored refresh hashes are implicated, frontend/API origins require a CORS/CSRF policy decision, or the refresh-token verification defect is involved.

## 10. Request returns 403, 401 at nginx, or role behavior seems wrong

**Classification:** Verified edge and RBAC behavior; intended authorization policy for some objects Unknown.

**Symptom**

- Staging/production request returns 401 before application logging; protected route returns 403; response body is the bare string `forbidden`; dev works but staging/production does not; or a request with no `X-API-Key` is unexpectedly accepted.

**Likely causes**

- `nginx.conf.template` requires `X-API-Key` for `/twhp/api/` and MinIO console. It returns edge 401 when missing/wrong. Development `nginx.conf` has no API-key gate.
- If `NGINX_API_KEY` renders empty, the Nginx map can treat a missing header (also empty) as valid. Compose does not enforce a non-empty substitution, so this is a verified conditional fail-open.
- Application JWT middleware returns JSON 401. RBAC returns HTTP 403 with bare string `forbidden` when JWT role is absent/not one of the route guard’s roles.
- Roles are exact enum values: `Factory`, `Provincial`, `Evaluator`, `DOED`.
- A domain service can separately return JSON 403 for resource/category/finalize rules. Evaluator detail region enforcement is missing on two routes and filename presigning checks only authentication; those are verified security findings, not support workarounds.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> logs --since=15m nginx-backend nginx-backend-stg nginx-backend-prod api api-dev
docker exec twhp-nginx nginx -T
```

Inspect the rendered map without copying its secret into tickets or chat. If the accepted map key is empty, remove traffic immediately rather than using the condition as a debugging bypass.

- Determine the layer from status/body and whether the request appears in API logs:
  - nginx 401: shared API key/gateway;
  - JSON 401: cookie/session middleware;
  - bare-string 403: role guard;
  - JSON 403: domain authorization.
- Relevant paths: `nginx/nginx.conf*`, `src/middleware/jwt.ts`, `src/middleware/rbac.ts`, `src/middleware/guards.ts`, route group files.

**Safe resolution**

- Require a non-empty approved edge credential and make Nginx startup fail before traffic when substitution is empty. Then send that credential through the trusted client/proxy and authenticate with an account whose stored role matches the documented route. Do not change account roles, disable guards, or expose nginx routes to diagnose access.

**Escalate when**

- A missing header was accepted, the rendered key was empty, stored account/subtype roles disagree, the user’s required access is a policy question, evaluator region/file scope is implicated, the API key is exposed, or outer proxy behavior differs from repository nginx. Treat observed fail-open traffic as a security incident and preserve edge logs.

## 11. Validation, parsing, upload-size, or response-contract error

**Classification:** Verified deployed root behavior and documented drift; client payload intent Unknown.

**Symptom**

- Request receives 400 though a route-only test/client expects 422; response validation produces generic 500; multipart upload is rejected; documented status/body differs from runtime.

**Likely causes**

- Root `onError` maps `VALIDATION`, `INVALID_FILE_TYPE`, and `PARSE` to 400 and logs parsed details. Route-only auth tests that omit the root handler expect Elysia’s default 422.
- `NOT_FOUND` becomes 404. Unexpected exceptions and response-schema mismatches become a generic 500 body; detail is only in server logs.
- Elysia and nginx each permit a 130 MiB total request body. Declared PDF fields are generally limited to 10 MiB per file. Upstream load balancer limits are Unknown.
- Path IDs mix `t.Number()` and `t.Numeric()`; multipart/numeric coercion and empty fields can therefore differ by route.
- Declared response status does not set runtime status. Several create/reset routes document 201 while handlers return 200. Some service errors are absent from route response unions.

**Diagnostic steps, evidence, and commands**

- Capture method, URL without sensitive query values, content type, status, and sanitized response. Compare the exact route schema and service return path.
- Check the API `Validation error`, `Expected error`, `Client error`, or `Unexpected error occurred` entry at the same time.
- For multipart, record total size, each file’s size/declared MIME, field names, and upstream status without storing the file in a ticket.
- Correlate the sanitized request with application and edge validation output:

  ```bash
  docker compose --profile <profile> logs --since=15m api api-dev nginx-backend nginx-backend-stg nginx-backend-prod
  ```

- Relevant paths: `src/index.ts`, `src/schema/**`, affected `src/routes/**` and `src/service/**`, `nginx/nginx.conf*`, and [API conventions](./api-conventions.md).

**Safe resolution**

- Correct the payload/content type/field names and rely on current runtime behavior as the immediate authority. Do not expand proxy/body limits as incident recovery without security and memory review.

**Escalate when**

- A valid payload causes response-validation 500, client generation is blocked by contract drift, upstream limits conflict, or choosing canonical 400/422 and 200/201 semantics requires an API decision.

## 12. Docker profile, service DNS, port, or nginx routing failure

**Classification:** Verified Compose topology; outer deployment and firewall Unknown.

**Symptom**

- Container cannot resolve/connect to a dependency; host connects on the wrong port; nginx 502; staging shared network fails; services conflict when profiles are combined.

**Likely causes and verified topology**

| Concern | Container endpoint | Host/repository exposure |
| --- | --- | --- |
| API dev/prod | `api-dev:3000` / `api:3000` (assuming required config) | no direct host mapping |
| nginx | port 80 | `127.0.0.1:81` |
| PostgreSQL | `postgres:5432` | host `5433` |
| Redis | `redis:6379` | host `6380` |
| MinIO S3/console | `minio:9000` / `minio:9001` | through nginx paths only |

- `docker compose config --profiles` reports `dev`, `staging`, and `production`.
- Dev services: PostgreSQL, Redis, `migrate-dev`, `api-dev`, `worker-dev`, MinIO, development nginx.
- Staging uses the dev-built API/migration/worker but template nginx and the external `shared-web-network`.
- Production uses pulled `rawinan/twhp-elysia-api:latest`, no-op `migrate-prod`, compiled worker, MinIO, and template nginx.
- All nginx variants use the same fixed container name `twhp-nginx`; profiles are intended to be mutually exclusive. Combining profiles can cause name/port conflicts.

**Diagnostic steps, evidence, and commands**

```bash
docker compose config --profiles
docker compose --profile <profile> config --services
docker compose --profile <profile> ps -a
docker network ls
docker network inspect twhp-elysia_default
docker network inspect shared-web-network
docker exec twhp-nginx getent hosts api api-dev minio
docker exec twhp-api-dev getent hosts postgres redis minio
```

- Use service DNS and container ports from containers; use published ports only from the host.
- Relevant paths: `docker-compose.yaml`, `nginx/nginx.conf*`, `docker.env`, `Dockerfile`.

**Safe resolution**

- Start exactly one intended profile; create/attach the externally managed shared network only through its deployment owner; correct service DNS/upstream selection; recreate the smallest affected service.
- Do not expose API/MinIO directly or broaden loopback bindings to fix routing. Production-inclusive PostgreSQL and unauthenticated Redis host publications are already a hardening risk; live firewall/reachability is Unknown.

**Escalate when**

- `shared-web-network`, outer TLS proxy, firewall, DNS, registry image, or host port ownership is external; multiple profiles must coexist; or production database/Redis exposure is reachable beyond the intended host boundary.

## 13. OpenAPI document is unavailable or disagrees with runtime

**Classification:** Verified snapshot/live behavior and drift; publication policy Unknown.

**Symptom**

- `/twhp/api/document` works in direct/dev access but is denied in staging/production; generated client omits cookies/401/403, requires an empty finalize body, expects 201 instead of runtime 200, or uses stale schemas.

**Likely causes**

- Elysia mounts live OpenAPI at `/twhp/api/document`. Template nginx has an exact deny-all location for that path; development nginx does not.
- `docs/api/openapi.json` and `docs/api/API.md` are static snapshots without source-commit metadata or a repository generation/check command. `API.md` records generation on 2026-07-03 and spec version `0.0.0`.
- Snapshot components have no cookie security scheme and protected operations generally omit middleware-generated 401/403/common errors.
- Known drift includes 200/201 creation statuses, root validation 400 versus route-test 422, finalize’s required empty OpenAPI body, file URL lifetime prose (five minutes) versus code (five seconds), and incomplete error variants.

**Diagnostic steps, evidence, and commands**

```bash
curl -i http://127.0.0.1:81/twhp/api/document
docker exec twhp-api-dev bun -e "fetch('http://127.0.0.1:3000/twhp/api/document').then(r => console.log(r.status, r.headers.get('content-type'))).catch(console.error)"
rg -n 'securitySchemes|"security"|"responses"' docs/api/openapi.json
git log -1 --format='%H %cI' -- docs/api/openapi.json docs/api/API.md src/routes src/schema
```

**Safe resolution**

- For incident diagnosis, inspect current route/schema/service source and live behavior in an approved non-production/direct environment. Do not bypass the production nginx deny or publish the live document without a policy decision.
- Regeneration and contract normalization are documentation/development work, not an operational hotfix; record source commit and review the diff when performed.

**Escalate when**

- A client integration depends on disputed behavior, production document exposure is requested, the dev-bypass header appears in a public contract, or there is no agreed source-of-truth/generation workflow.

## 14. Generic 500 or unexpected runtime exception

**Classification:** Verified error/logging behavior; concrete exception Unknown until correlated.

**Symptom**

- Client sees `{ "message": "Unexpected error" }`; container restarts; request hangs; business action may or may not have committed.

**Likely causes**

- Global error handling intentionally hides unexpected detail from clients and logs `Unexpected error occurred` with the message and request metadata.
- Import-time config/client failures, database errors, response-schema mismatch, MinIO/Redis/queue failures, and unhandled library errors can all reach the generic path.
- External operations have different commit points. A 500 is not proof of rollback: uploads may already exist, old files may already be deleted, Redis challenges may already be stored, or a DB transaction may have committed before email enqueue failed/was swallowed.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> logs --since=15m --timestamps api api-dev nginx-backend nginx-backend-stg nginx-backend-prod worker worker-dev postgres redis minio
```

1. Record timestamp/timezone, request method/path, actor/account ID if safely known, returned status, and a request/correlation identifier if an outer proxy supplies one. The app itself does not establish a correlation ID.
2. Correlate API, nginx, dependency, and worker logs in the same window.
3. Determine the operation’s commit boundary from the service before retrying:
   - DB-only transaction;
   - upload/delete before DB;
   - DB commit before queue enqueue;
   - Redis state before queue enqueue.
4. Query the durable state read-only: latest `CoverLogs`/`AnswerLogs` order by serial `id`, affected database filenames, Redis key TTL, and queue job presence. Avoid dumping sensitive values.

Relevant paths: `src/index.ts`, the affected `src/service/**`, `src/utils.ts`, `src/queue/email.ts`, `src/worker/email.ts`.

**Safe resolution**

- Fix/restore the identified dependency or bad input first. Retry only after proving the operation is idempotent or confirming no side effect occurred. Finalize and append-log operations are not generally safe blind retries.
- Preserve the first failure logs before restart. Restart only the process with a proven transient failure; confirm durable and external state afterward.

**Escalate when**

- The same 500 repeats, process crashes/restarts, side-effect state is ambiguous, data/object repair is required, sensitive data appears in logs, or no dependency explains the exception.

## 15. Logging, evidence collection, and recovery discipline

**Classification:** Verified logging implementation; retention/aggregation/alerting Unknown.

**Symptom**

- Logs are incomplete/inconsistent across API and worker; a 4xx appears once with differing shape; no trace connects API request to queue delivery.

**Likely causes and verified behavior**

- API uses structured Pino logging with Bangkok-formatted time. Successful health requests are deliberately ignored. `onError` logs validation/not-found/unexpected errors and marks the request; `onAfterResponse` logs other 4xx/5xx service responses once.
- Request serialization records method, full URL, content type, whether Authorization exists, forwarded IP, and user agent; it does not log cookie/body values. Full URL means query values such as `fileName` can appear.
- `src/index.ts`, `src/utils.ts`, `src/workers.ts`, `src/worker/email.ts`, and evaluator email enqueue handling also use `console.*`. Worker logs have no shared correlation ID, structured BullMQ event hooks, or API logger context.
- Repository evidence contains no centralized log destination, retention/redaction policy, metrics, traces, queue dashboard, alert thresholds, or incident command.

**Diagnostic steps, evidence, and commands**

```bash
docker compose --profile <profile> logs --since=30m --timestamps api api-dev worker worker-dev nginx-backend nginx-backend-stg nginx-backend-prod postgres redis minio
docker inspect --format '{{.RestartCount}} {{.State.Status}} {{.State.StartedAt}}' <container>
```

- Sanitize exported evidence. Redact URL query values, emails where unnecessary, object names, secrets, cookies, OTP/reset data, and SMTP/DB connection strings.
- Preserve timezone context: API timestamps are formatted for Asia/Bangkok, while dependency/container timestamps may be UTC or another configured zone.

**Safe resolution/recovery checklist**

1. Stop automated/manual retries for a non-idempotent operation.
2. Preserve logs and current state.
3. Restore the failed dependency.
4. Verify PostgreSQL durable state and latest logs.
5. Verify Redis/BullMQ state without exposing payloads.
6. Verify MinIO references versus objects for file workflows.
7. Replay/retry only the smallest proven-missing side effect.
8. Validate through the real ingress, then monitor at least one normal workflow.

**Escalate when**

- Evidence cannot be correlated, log retention is insufficient, personal/security data leaked, manual replay/repair is needed, or an incident spans PostgreSQL plus Redis/BullMQ/MinIO.

## Contradictions and operational decisions required

| Item | Evidence/classification | Operational consequence | Decision owner needed |
| --- | --- | --- | --- |
| Production migration/import | `migrate-prod` is a no-op; prose says import CSV directly. **Verified**, external process **Unknown**. | Production startup cannot establish schema/data parity. | Deployment + database owner must document backup, import, drift check, rollback. |
| Health/readiness | `/health` is static; API check hard-codes 3000. **Verified**. | Healthy does not mean dependencies/worker are ready; different `APP_PORT` is false-unhealthy. | Decide fixed port invariant and dependency readiness policy. |
| PostgreSQL health identity | Health command fixes `admin`/`twhp`, while image accepts env-controlled user/db. **Verified**. | Config changes can produce false unhealthy state. | Decide invariant or parameterize health check. |
| Nginx API-key empty substitution | An empty `NGINX_API_KEY` can match a missing header in the rendered map. **Verified conditional fail-open**. | Shared edge gate may admit requests without the intended key. | Deployment/security owner must validate non-empty and fail startup before traffic. |
| Environment naming | `docker.env` uses `POSTGRES_DB`; the local `.env` key inventory uses `POSTGRES_DATABASE`. **Verified names only**. | Local tooling/Compose can initialize different expectations. | Standardize documented key; never copy values between environments blindly. |
| SMTP flags | `SMTP_STARTTLS`/`SMTP_SECURE` are required but unused. **Verified**. | Operators cannot infer transport security from configured flags. | Wire explicit Nodemailer behavior or remove/replace flags. |
| Presigned lifetime | Route says five minutes; code signs for five seconds. **Verified**. | Normal latency/clock skew can look like storage failure. | Product/security decision on intended lifetime. |
| OpenAPI/error status | Root validation 400, route tests 422; declared create/reset statuses can be 201 while runtime is 200. **Verified**. | Generated clients and runbooks misclassify valid responses. | API owner chooses canonical contract and automation. |
| Edge auth | Dev nginx has no API-key gate; staging/production template does. **Verified**. | “Works in dev” does not prove deployed client carries the ingress credential. | Deployment owner documents key distribution and rotation. |
| Dev OTP protection | Comment describes production hard-block; code uses `COOKIE_SECURE`, not `NODE_ENV`. **Verified**. | A bad production config could enable bypass. | Security/deployment owner defines environment invariant and enforcement. |
| Worker time | Compose TZ says Bangkok; BullMQ repeat has no explicit timezone. **Verified code**, runtime scheduling **Inferred**. | Direct/misconfigured worker can run reminder at wrong local time. | Define explicit timezone and replica ownership. |
| Email guarantees | OTP/reset retry; verdict/reminder default single attempt; finalize may swallow enqueue error. **Verified**. | API/DB success does not imply notification and replay may duplicate effects. | Product/operations define retry, idempotency, alerting, replay. |
| File/DB consistency | External file operations are outside DB transactions and vary in order. **Verified**. | Failure can create orphan objects or DB references to missing files. | Define reconciliation, backup/restore, and compensation procedure. |
| Test command | `package.json` `test` intentionally exits 1 although Bun test files exist. **Verified**. | `bun run test` is not a health/verification command. | Maintainer defines supported test suite/CI command. |

## Deployment unknowns requiring owner confirmation

- Exact production/staging hosts, orchestrator, number of API/worker replicas, image pinning/digest policy, and release/rollback owner.
- Exact Bun image/runtime version; Docker uses floating `oven/bun:1` tags and production application image `latest`.
- Actual TLS terminator, public hostname/path, outer proxy/Cloudflare behavior, trusted-forwarded-header chain, API-key injection point, firewall/security groups, and whether nginx loopback port 81 is fronted externally.
- Whether the external `shared-web-network` exists everywhere, who creates it, and upstream service naming expectations.
- Production PostgreSQL schema/catalog drift, timezone, SSL, grants, extensions, pool limits, backup/PITR, restore tests, monitoring, capacity, and approved CSV/import process.
- Redis authentication/TLS/HA, persistence/eviction policy, memory limits, backup, monitoring, and whether host port 6380 is externally reachable.
- BullMQ dashboard/metrics, failed/stalled job alerting, job replay ownership, retention expectations, and worker replica count.
- SMTP provider requirements, TLS mode, sender-domain policy, quotas, delivery/bounce visibility, escalation contacts, and outbound-network restrictions.
- MinIO application-versus-root credential policy, bucket policy/versioning/backup/replication, object inventory/reconciliation, clock synchronization, console exposure, and restore ownership.
- Frontend/API origin relationship, cookie-domain expectations, CORS/CSRF policy, and real browser credential behavior.
- Central log aggregation, retention/redaction/access, metrics/traces/correlation IDs, alert thresholds, on-call contacts, incident severity model, and recovery-time/recovery-point objectives.

## Related documentation

- [Architecture](./architecture.md) and [project structure](./project-structure.md)
- [API conventions](./api-conventions.md) and the [OpenAPI snapshot](./api/openapi.json)
- [Database and persistence](./database.md)
- [Authentication and authorization](./authentication-authorization.md)
- [Domain model](./domain-model.md) and [business rules](./business-rules.md)
- [Testing](./testing.md)

## Confidence and source notes

- **High confidence:** startup validation, route prefix/health behavior, Compose profile topology/ports/dependencies, nginx API-key/OpenAPI differences, database/seed lifecycle in repository, Redis key families, queue/job names and configured retries, worker schedule declaration, MinIO five-second signing/rewrite, cookie/RBAC behavior, root error mapping, logging paths, and known OpenAPI drift. These were read directly from current source/configuration and cross-checked against handover drafts.
- **Medium confidence:** exact user-visible results of network loss, clock skew, container DNS mistakes, queue delay, and cross-store partial failure. The ordering is verified, but no incident was reproduced against live services.
- **Unknown:** all current deployed state and organizational procedures listed above. No incident, outage history, delivery failure, corruption, exploit, or production exposure is claimed by this guide.

Primary evidence: `AGENTS.md`, current source/configuration, the related maintainer documentation above, and the architecture/API/database/domain/security investigation drafts. Deployment-specific values and procedures remain Unknown until confirmed by their owners.
