---
name: verify
description: Drive the real twhp-elysia API, BullMQ worker and email delivery in a disposable Docker stack, with Mailpit catching every email, to prove an API or email change works end to end. Use after changing routes, services, auth, the queue or the worker (src/queue, src/worker), or whenever a change must be shown working on the running app rather than in unit tests.
---

# Verify twhp-elysia on a disposable stack

The surface is the HTTP API under `/twhp/api` plus the emails the worker sends. The stack is
`docker-compose.verify.yaml`, project `twhp-verify`. It is fully separate from the dev stack in
`docker-compose.yaml`: its own image tag (`twhp-api:verify`), volumes, network and ports, and no
`container_name`. Its Postgres, Redis and MinIO answer to the hostnames `docker.env` already uses
(`twhp-postgres`, `twhp-redis`, `minio`) through network aliases. SMTP is forced to Mailpit, so no
email reaches the real relay in `docker.env`.

Never point these steps at the dev stack (`twhp-api-dev`, port 5433) or production. Never run
`docker compose` here without `-p twhp-verify -f docker-compose.verify.yaml`; the helper always
adds both.

Every command below uses the helper `.claude/skills/verify/scripts/stack.sh`, run from the repo
root. Call it `S` below: `S=.claude/skills/verify/scripts/stack.sh`.

## Launch

```bash
$S up
```

It builds `twhp-api:verify` from the `build` stage of the `Dockerfile` (the current working tree),
then waits until every healthcheck passes. `migrate` runs `bun run db:push && bun run db:seed` on
an empty database and must exit 0 before `api` starts. `worker` runs `bun run worker` from the same
image, so it always has the code you just changed. Ready means `$S doctor` passes. A first build
takes a few minutes; later ones take about 20 seconds.

Rebuild after any code change: run `$S up` again. The image bakes the source in, with no bind mount.

## Doctor

```bash
$S doctor
```

It requires `migrate` to have exited 0, the API to answer `GET /twhp/api/health` on
`127.0.0.1:3901`, Mailpit to answer on `127.0.0.1:8925`, and both `api` and `worker` to have
`SMTP_HOST=mailpit`. If the last check fails, stop: the stack could reach the real relay.

## Drive

- `$S login <username> <password>` logs in through `POST /authentication/login`. For a staff
  account that needs an OTP, it reads the code from the email in Mailpit and posts
  `/authentication/login/verify-otp`. Cookies land in `.verify-evidence/cookies.txt` and later
  `call`s reuse them. The seeded DOED admin is `test1` / `12345` (`admin@test.com`, needs OTP).
  Seeded evaluators come from `seed_data/eval.json` (for example `odpc1`).
- `$S call <METHOD> <path> [json]` sends one request as the logged-in user and prints the body and
  `HTTP <code>`. Paths start after `/twhp/api`, as in `$S call GET /authentication`.
- `$S mail` lists every caught email: id, To, Cc, subject. `$S mail-save <id>` stores the full
  message as JSON in `.verify-evidence/`.
- `$S sql "<query>"` runs read-only checks against the verify database, such as the latest
  `CoverLogs` row for a Cover.
- `$S logs <service>` prints `api` or `worker` logs. The worker logs `accepted` and `rejected`
  recipients for every send.

Request bodies are in the live OpenAPI document at
`http://127.0.0.1:3901/twhp/api/document/json`. Read it instead of guessing a body.

The features to drive are mapped in [features/README.md](features/README.md).

## Evidence

Evidence goes in `.verify-evidence/` at the repo root (gitignored). It survives cleanup. A proof
needs the request and the response (`call` output), the stored state after it (`sql`), and every
side effect: for email, the saved message showing To, Cc, subject and body. Drive the real routes
as a real role. Never insert rows to fake a precondition the journey is about, and never call a
service function directly. An email proof is the message in Mailpit, not a log line or a queued job.

## Cleanup

```bash
$S down
```

It removes the `twhp-verify` containers, network and volumes, and nothing else. The
`twhp-api:verify` image stays as a build cache. `.verify-evidence/` stays. Delete it yourself when
the proof is no longer needed.
