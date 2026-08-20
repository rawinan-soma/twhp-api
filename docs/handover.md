# Maintainer Handover

Audit date: 2026-07-15

This is the final technical handover for the Thailand Workplace Health Promotion (TWHP) backend. Read it as the starting point, then follow links into the evidence-focused documents. Repository behavior, configuration, and tests were treated as authoritative; where they conflict with older prose, the conflict is called out rather than guessed away.

## System purpose

TWHP is a Bun/TypeScript API for factory registration, annual enrollment, workplace-health assessments, evidence upload, geographically scoped review, score/grade calculation, and notification. The repository does not establish an authoritative expansion of the acronym. The API is built on ElysiaJS and PostgreSQL/Drizzle. Redis/BullMQ carries OTP, reset, reminder, and result-email work; MinIO stores evidence objects. The HTTP API and queue worker are separate processes.

See [Architecture](architecture.md), [Domain model](domain-model.md), and [Project structure](project-structure.md).

## Current implementation status

The main registration, enrollment, assessment, review, scoring, OTP, email, and file paths are implemented. Recent work introduced durable per-answer reviewer saves followed by a separate whole-cover finalize operation. There are 167 Bun tests in 12 files, but the repository's `test` package script is still a failing placeholder. Eighty-six isolated tests were safely executed during this audit and passed; the 81 PostgreSQL integration tests were not run because their fallback targets the mutable local development database.

The codebase is actively developed on `feat/per-answer-verdict-save`. This handover does not assert that the current branch has been released. Deployed commit, database state, operational ownership, and release history are **Unknown / Requires Organizational Knowledge**.

## What is stable

- The source layout and bootstrap paths are clear: `src/index.ts` for the API and `src/workers.ts` for the worker.
- Filesystem route autoload, TypeBox DTOs, service factories, Drizzle schema, and role guards form consistent conventions.
- The four account roles are `Factory`, `Provincial`, `Evaluator`, and `DOED`; evaluator levels further restrict category authority.
- Fiscal-year queries consistently call `utilities().getFiscalYear()` rather than defining local date windows.
- Score and grade are derived on demand from answer state; they are not stored.
- The API prefix is `/twhp/api`, health is `/twhp/api/health`, and live OpenAPI is `/twhp/api/document` when not blocked by the production proxy.

These statements describe consistent repository structure, not production availability.

## What is fragile

- Refresh JWT signature and expiry are not verified before a hash-matched refresh token mints a new session.
- Evaluator detail routes do not scope requested IDs to the evaluator's region, and file presigning checks authentication but not resource ownership.
- Enrollment/cover/answer cardinalities are pre-checked in services but not enforced by database uniqueness; concurrent requests can violate them.
- Finalize has no cover-state, lock, version, or idempotency guard and may repeat transitions and emails.
- Business policy documents conflict with code on accepted change scores, standard-question acceptance, Gold special-question gating, `n/a`, and some state gates.
- MinIO changes and PostgreSQL transactions are not atomic; failures can leave missing or orphaned evidence.
- The production migration container is a successful no-op and production images use mutable tags.
- A clean clone lacks ignored/untracked `seed_data/`, although image build and seeding require it.
- An empty rendered `NGINX_API_KEY` can make the staging/production proxy accept a missing API-key header.
- Health checks are liveness-only; there is no CI/CD, readiness, worker health, backup, restore, or rollback implementation in the repository.

The prioritized evidence and remediation sequence are in [Technical debt](technical-debt.md).

## Important architectural decisions

- Routes are auto-registered from `src/routes/`; do not add manual controller registration.
- Domain route files call services; TypeBox DTOs live in `src/schema/`; PostgreSQL shape lives only in `src/drizzle/schema.ts`.
- Services return Elysia `status(code, body)` responses rather than throwing expected business errors.
- Current application paths append to `coverLogs` and `answerLogs`; current state is “latest log wins,” normally by descending serial ID. Database immutability is not enforced.
- Score and grade are calculated at read/finalize time and are not persisted.
- File operations occur outside database transactions. That is an intentional boundary but not a distributed transaction.
- Staff authentication uses password plus email OTP, except first-login staff; Factory accounts do not use OTP.
- Review is two-phase: save one answer verdict, then ODPC/admin finalizes the whole Cover.

## Critical business rules

- The fiscal year begins October 1 and ends at the next October 1 boundary. Use `utilities().getFiscalYear()`; timezone correctness at deployment remains unresolved.
- Intended cardinalities are one enrollment per Factory/fiscal year, one Cover per Enrollment, and one Answer per Cover/Question. They are not currently durable database constraints.
- Evaluator scope combines health region and level/category ownership: Mental → Mental; DOH → Disease/Safety; ODPC → all categories and finalization.
- A save verdict is `approve`, `change_score`, or `reject`. Per-answer saves do not move the Cover; finalize is the sole evaluator/admin Cover transition and sole writer of `finished`. Cover creation and Factory submission also append Cover transitions.
- Scores use the live selected choice and exclude `n/a` from numerator and denominator. Grade evaluation is ordered Gold → Silver → Certificate → Joined.
- Evidence requirements depend on choice and question metadata; changing standard mappings or `seed_data/questions.json` can change validation and scoring together.

The current-code rule cards, contradictions, edge cases, and change risks are in [Business rules](business-rules.md).

## Security-sensitive areas

Do not modify authentication, refresh, RBAC, evaluator detail queries, presigning, OTP bypass, password recovery, or cookie behavior without reading [Authentication and authorization](authentication-authorization.md).

Immediate receiving-team actions:

1. Verify refresh JWTs cryptographically, including expiry, before database hash lookup and access-token issuance.
2. Add region/resource authorization to evaluator detail reads and replace filename-only presigning with resource-scoped access.
3. Decide and implement password-change/reset refresh revocation, password-login abuse controls, and browser-edge policy.
4. Confirm that `DEV_SKIP_OTP` can never be effective in a deployed environment; current code treats `COOKIE_SECURE=true` as the production boundary.

## Known limitations

- Response status and shape conventions are inconsistent; some OpenAPI `201` responses execute as `200`, middleware errors are not uniformly documented, and the static API snapshot can drift.
- The nine staff list endpoints are paginated with a total order and a `{ items, meta }` envelope (see [API conventions](api-conventions.md#pagination)); all other lists remain unpaginated and some of their ordering is still incidental. No bulk-export path exists, so a consumer needing a complete staff list must page through it.
- Email queue retry/idempotency policies vary, and a successful API request does not prove delivery.
- SMTP security flags are required but unused by the Nodemailer transport.
- Exact Bun runtime is not pinned; several images/dependencies float.
- Services advertised as database-injectable still close over global Redis, queue, MinIO, or other singleton services.
- `answer.ts`, `authentication.ts`, `enroll.ts`, and `evaluator-review.ts` are large, high-coupling change hotspots.

## Deployment assumptions

Current Compose assumes API port 3000, PostgreSQL host port 5433, Redis host port 6380, an existing `shared-web-network`, and an external public edge/TLS layer. Production startup does not prove schema compatibility because `migrate-prod` only prints a message. Do not deploy until the organization supplies an approved backup, schema/data promotion, validation, rollback, immutable artifact, and secret-management process. See [Deployment](deployment.md).

## Recommended next work

1. Fix refresh-token verification and add expiry/tamper/revocation tests.
2. Close evaluator-detail and file-presign object authorization gaps.
3. Make the Nginx API-key gate fail closed on empty substitution and establish the authoritative `seed_data/` source.
4. Define and enforce database cardinalities plus idempotent/concurrency-safe finalize semantics.
5. Obtain product decisions for the rule conflicts listed in `business-rules.md`; update code, ADRs, and tests together.
6. Establish a disposable integration-test database, real package quality scripts, CI, and type checking.
7. Publish an immutable, reversible production release procedure with schema/data verification.
8. Add readiness, worker health, structured worker logs, alerting, backup/restore tests, and email/file reconciliation.
9. Only then split large services and centralize repeated state/access rules behind tested boundaries.

## If You Only Have 30 Minutes

Follow this sequence exactly:

1. Minutes 0–4: read this file and [Documentation index](README.md).
2. Minutes 4–9: read the diagrams and boundaries in [Architecture](architecture.md).
3. Minutes 9–14: read TD-01 through TD-07 in [Technical debt](technical-debt.md).
4. Minutes 14–19: read the refresh flow and verified defects in [Authentication and authorization](authentication-authorization.md).
5. Minutes 19–24: read BR-06 through BR-27 in [Business rules](business-rules.md).
6. Minutes 24–27: inspect `src/index.ts`, `src/middleware/jwt.ts`, `src/service/authentication.ts`, and `src/service/evaluator-review.ts`.
7. Minutes 27–30: read the production no-op and release preconditions in [Deployment](deployment.md). Do not execute a production change in this window.

## First Day Checklist

- [ ] Confirm the checkout/branch and preserve existing work: `git status --short`.
- [ ] Obtain approved development-only environment values; never copy production secrets into local files.
- [ ] Read [Development](development.md), then start dependencies/application using the verified command appropriate to the environment.
- [ ] Confirm `GET /twhp/api/health` returns liveness, while remembering it does not test dependencies.
- [ ] Connect to a disposable or explicitly approved PostgreSQL database and inspect schema/seed expectations in [Database](database.md).
- [ ] Confirm exactly one intended worker: use Compose `worker-dev` or, with explicitly approved non-production PostgreSQL/Redis/SMTP settings, native `bun run worker`. Do not start both unless an approved replica/scheduler topology requires it.
- [ ] Authenticate once as Factory and once through the staff OTP flow using non-production accounts.
- [ ] Run the five safe isolated commands recorded in [Testing](testing.md). Do not run all integration tests until `DATABASE_URL` is proven disposable.
- [ ] Locate API stdout/stderr and worker/container logs; no centralized observability destination is configured here.
- [ ] Verify registration/enrollment, Cover creation, answer save/submit, scoped evaluator review, finalize, score/grade, email job, and a presigned evidence read in a disposable environment.
- [ ] Ask the organization the unresolved questions below before accepting production on-call ownership.

## Before You Modify the System

For both humans and AI agents:

- [ ] Read the task-specific documents in [Documentation index](README.md).
- [ ] Inspect current source and tests; do not treat the legacy root `../README.md`, `CONTEXT.md`, memory-bank artifacts, ADRs, or static OpenAPI as automatically current.
- [ ] Identify the authoritative state transition, role/region/category scope, fiscal-year boundary, and database constraint affected.
- [ ] Check whether the change spans PostgreSQL, Redis/BullMQ, MinIO, email, cookies, or Nginx; define partial-failure behavior.
- [ ] Preserve service factory, route autoload, base-schema composition, status-response, and file-I/O boundaries unless an approved architecture change says otherwise.
- [ ] Add focused tests. Use a disposable seeded database for integration tests.
- [ ] Run formatting/lint/type/test/build checks that actually exist and report exact failures; do not use the failing `bun run test` stub as proof.
- [ ] Update API artifacts, ADR/domain docs, and handover docs when a public contract or business rule changes.
- [ ] Review the diff for secrets, unsafe environment values, generated migration edits, unrelated working-tree changes, and production behavior outside task scope.

## Do Not Change Casually

- Refresh-token verification, cookie options, OTP/DEV bypass, or role guards.
- Fiscal-year boundaries or timezone handling.
- `standardTypes`, standard mapping objects, Question seed metadata, choice/evidence validation, score formula, or grade ordering/thresholds.
- Answer/Cover status values, latest-log ordering, authorship/edit guards, or finalize behavior.
- Enrollment/Cover/Answer cardinalities or evaluator assignment semantics.
- MinIO filename persistence, presigned URL rewriting, file delete/upload ordering, or the 130 MiB request limit.
- Production `migrate-prod`, image tags, port 3000 assumptions, Nginx/API-key rules, or external network wiring.
- Email job names, retry/idempotency behavior, or the daily schedule.

## Questions the Organization Still Needs to Answer

Every item below is **Unknown / Requires Organizational Knowledge**:

- Which commit, image digest, schema version, and seed/import state are currently deployed in each environment?
- Who owns releases, production database changes/imports, backups, restores, rollback, secrets, DNS/TLS, the external edge, and incident response?
- What are the recovery objectives, retention requirements, audit obligations, and personal-data classification?
- Are all frontends same-origin/same-site with the API, and what CORS/CSRF/security-header policy is required?
- Is evaluator detail access strictly regional, and what exact ownership/category rules must apply to every evidence file?
- What are the canonical intended rules for accepted change scores, Standard Question acceptance, `n/a`, Gold `special` values, post-submit edits, and evidence retention?
- What timezone is authoritative for fiscal-year queries and stored timestamps?
- What are the maximum data volumes, email delivery SLOs, and acceptable presigned URL lifetime? _(The pagination and ordering contract is answered for the nine staff lists — see [API conventions](api-conventions.md#pagination). The data-volume question remains open.)_
- Which environment may contain the seeded DOED credential, and has every non-disposable copy been rotated or removed?
- Where are logs/metrics/alerts retained, who receives them, and what constitutes readiness versus liveness?

Until these have owners and answers, the documentation can support safe repository work but cannot substitute for a production operating agreement.
