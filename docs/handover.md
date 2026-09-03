# Maintainer Handover

Original audit: 2026-07-15. Refreshed for transfer: **2026-09-02**, branch `dev`.

This is the technical handover for the Thailand Workplace Health Promotion (TWHP) backend. Read it as the starting point, then follow links into the evidence-focused documents. Repository behavior, configuration, and tests were treated as authoritative; where they conflict with older prose, the conflict is called out rather than guessed away.

**What changed since the original audit** (see [Work completed since 2026-07-15](#work-completed-since-2026-07-15) for detail): the nine staff list endpoints gained an offset-pagination envelope, Cover-status resolution was consolidated into one module, an evaluator's score change became terminal, and the Admin factory list now exposes the account email. ADRs 0007–0012 record those decisions. Deployment, configuration, authentication, and middleware source is unchanged since the original audit, so every statement about those subjects carries that earlier verification forward.

## System purpose

TWHP is a Bun/TypeScript API for factory registration, annual enrollment, workplace-health assessments, evidence upload, geographically scoped review, score/grade calculation, and notification. The repository does not establish an authoritative expansion of the acronym. The API is built on ElysiaJS and PostgreSQL/Drizzle. Redis/BullMQ carries OTP, reset, reminder, and result-email work; MinIO stores evidence objects. The HTTP API and queue worker are separate processes.

See [Architecture](architecture.md), [Domain model](domain-model.md), and [Project structure](project-structure.md).

## Current implementation status

The main registration, enrollment, assessment, review, scoring, OTP, email, and file paths are implemented. Reviewer saves are durable and per-answer, followed by a separate whole-cover finalize. There are 315 declared Bun test cases in 18 files, but the repository's `test` package script is still a failing placeholder. The 8 isolated files were executed on 2026-09-02 and passed — 201 tests, 0 failures. The 10 PostgreSQL integration files were not run, because their fallback targets the mutable local development database.

Work is on `dev`, which is 6 commits ahead of `main` and identical to `staging`. This handover does not assert that any branch has been released. Deployed commit, database state, operational ownership, and release history are **Unknown / Requires Organizational Knowledge**.

## What is stable

- The source layout and bootstrap paths are clear: `src/index.ts` for the API and `src/workers.ts` for the worker.
- Filesystem route autoload, TypeBox DTOs, service factories, Drizzle schema, and role guards form consistent conventions.
- The four account roles are `Factory`, `Provincial`, `Evaluator`, and `DOED`; evaluator levels further restrict category authority.
- Fiscal-year queries consistently call `utilities().getFiscalYear()` rather than defining local date windows.
- Score and grade are derived on demand from answer state; they are not stored.
- The API prefix is `/twhp/api`, health is `/twhp/api/health`, and live OpenAPI is `/twhp/api/document` when not blocked by the production proxy.
- Cover-status resolution has one owner, `src/service/coverStatus.ts`, and the nine staff lists share one pagination contract in `src/schema/pagination.ts`. Both are covered by isolated tests.

These statements describe consistent repository structure, not production availability.

## What is fragile

- Refresh JWT signature and expiry are not verified before a hash-matched refresh token mints a new session.
- Evaluator detail routes do not scope requested IDs to the evaluator's region, and file presigning checks authentication but not resource ownership.
- Enrollment/cover/answer cardinalities are pre-checked in services but not enforced by database uniqueness; concurrent requests can violate them.
- Finalize has no cover-state, lock, version, or idempotency guard and may repeat transitions and emails.
- Business policy documents conflict with code on standard-question acceptance, Gold special-question gating, `n/a`, and some state gates.
- ADR-0012 withdrew the factory's right to contest a score. The `accept` branch in `answer.ts` is retained but unreachable for score changes, pending confirmation that no deployed frontend still calls it — confirm this with the frontend owner before removing it.
- Covers finalized between 2026-07-07 and 2026-08-25 lost evidence under ADR-0006. A production backfill was deferred by explicit decision and its exposure was never measured; no code change recovers those files.
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
- An evaluator's `change_score` is **terminal** and preserves evidence; only a hard reject (`status = 'rejected'` **and** `verdict_choice IS NULL`) deletes files and bounces the Cover ([ADR-0012](adr/0012-score-changes-are-terminal.md)).
- Cover status is resolved only through `src/service/coverStatus.ts` ([ADR-0010](adr/0010-lateral-latest-cover-log-resolution.md)).
- The `{ items, meta }` pagination envelope is scoped to the nine staff lists; every other list is a bare array ([ADR-0007](adr/0007-pagination-envelope-scoped-exception.md), [ADR-0009](adr/0009-offset-pagination-for-staff-lists.md)).

## Work completed since 2026-07-15

Six commits on `dev` ahead of `main`, plus the merged pagination branch. Each was delivered through the FIRE flow; briefs and per-run plan/test/review/walkthrough artifacts are under `.specs-fire/`, and older intents under `memory-bank/`.

| Change | What it did | Decision record |
|---|---|---|
| Staff list pagination (intent 012, bolts 025–028) | Offset pagination with an `{ items, meta }` envelope on the nine staff list endpoints, a shared `src/schema/pagination.ts` contract, an `EXISTS` subquery replacing a row-multiplying join on the factory lists, and page-scoped answer hydration on the score reports | [ADR-0007](adr/0007-pagination-envelope-scoped-exception.md), [ADR-0008](adr/0008-exists-subquery-for-enrolled-filter.md), [ADR-0009](adr/0009-offset-pagination-for-staff-lists.md), [ADR-0011](adr/0011-two-phase-read-for-computed-list-items.md) |
| Cover-status consolidation | One module owning the latest-cover-log rule in both query shapes, so the count query and the page query share one predicate | [ADR-0010](adr/0010-lateral-latest-cover-log-resolution.md) |
| Score-change finality (intent `score-change-finality`, runs 005–010) | `change_score` writes `recommended` and is terminal; finalize writes the Verdict Score into `answers.selected_choice`; evidence is preserved for score changes; a hard reject on a standard-backed question also deletes the named certificates and un-claims them; the Cover finishes in one pass when its only corrections are score changes | [ADR-0012](adr/0012-score-changes-are-terminal.md), which supersedes ADR-0006 in full and ADR-0004 in part |
| Verdict email addressing | The verdict email is addressed to the factory account and cc's the safety officer | — |
| Explicit evidence deletion on answer PATCH | The answer PATCH contract now specifies which evidence files it deletes | — |
| Admin factory list email (intent `admin-factory-email`) | The Admin factory list exposes the linked account's email | — |
| Traceability reports | Requirements and evaluation traceability, English and Thai, plus spreadsheets | — |

Two follow-ups were deliberately deferred and remain open: the ADR-0006 evidence backfill, and preserving the factory's original claim as a delta once finalize overwrites `selected_choice`. Both need a decision from the receiving team.

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

None of these four were addressed by the work completed since 2026-07-15; they remain the top of the security backlog.

## Known limitations

- Response status and shape conventions are inconsistent; some OpenAPI `201` responses execute as `200`, middleware errors are not uniformly documented, and the static API snapshot can drift.
- The nine staff list endpoints are paginated with a total order and a `{ items, meta }` envelope (see [API conventions](api-conventions.md#pagination)); all other lists remain unpaginated and some of their ordering is still incidental. No bulk-export path exists, so a consumer needing a complete staff list must page through it.
- The factory's original claim is not preserved once finalize writes a Verdict Score into `answers.selected_choice`. Recovering it as a visible delta needs a schema change.
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
9. Only then split large services and centralize repeated state/access rules behind tested boundaries. Cover status (ADR-0010) and the pagination contract (ADR-0009) are worked examples of what that looks like.
10. Decide the two deferred follow-ups from the score-change work: whether to backfill Covers finalized under ADR-0006, and whether to preserve the factory's original claim as a visible delta once finalize overwrites `selected_choice`.
11. Confirm with the frontend owner that nothing still calls `accept` on a score change, then remove the unreachable branch in `answer.ts`.

## If You Only Have 30 Minutes

Follow this sequence exactly:

1. Minutes 0–4: read this file and [Documentation index](README.md). The root [`README.md`](../README.md) is a faster orientation if you have not seen the repository at all.
2. Minutes 4–9: read the diagrams and boundaries in [Architecture](architecture.md).
3. Minutes 9–14: read TD-01 through TD-07 in [Technical debt](technical-debt.md).
4. Minutes 14–19: read the refresh flow and verified defects in [Authentication and authorization](authentication-authorization.md).
5. Minutes 19–24: read BR-06 through BR-27 in [Business rules](business-rules.md) and [ADR-0012](adr/0012-score-changes-are-terminal.md), which changed the review model most recently.
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
- [ ] Run the eight safe isolated test files recorded in [Testing](testing.md). Do not run all integration tests until `DATABASE_URL` is proven disposable.
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
- What are the canonical intended rules for Standard Question acceptance, `n/a`, Gold `special` values, post-submit edits, and evidence retention? _(Score-change finality is answered — see [ADR-0012](adr/0012-score-changes-are-terminal.md).)_
- Should the evidence lost to ADR-0006 between 2026-07-07 and 2026-08-25 be measured and remediated, and is a frontend confirmation step required before a hard reject deletes a real-world certificate?
- What timezone is authoritative for fiscal-year queries and stored timestamps?
- What are the maximum data volumes, email delivery SLOs, and acceptable presigned URL lifetime? _(The pagination and ordering contract is answered for the nine staff lists — see [API conventions](api-conventions.md#pagination). The data-volume question remains open.)_
- Which environment may contain the seeded DOED credential, and has every non-disposable copy been rotated or removed?
- Where are logs/metrics/alerts retained, who receives them, and what constitutes readiness versus liveness?

Until these have owners and answers, the documentation can support safe repository work but cannot substitute for a production operating agreement.

## Handing this repository over

The receiving team needs, from the outgoing owner and outside this repository:

- [ ] `seed_data/` — it is git-ignored, absent from the clone, and required by both the image build and `db:seed`. Confirm its authoritative source and who may access it.
- [ ] Environment values for each environment, and the secret store they live in. Never copy production secrets into a local `.env`.
- [ ] Registry credentials for `rawinan/twhp-elysia-api`, plus whoever can publish and roll back an image.
- [ ] Access to the deployment host, the external `shared-web-network`, the TLS/edge layer, DNS, and the SMTP account.
- [ ] Database, Redis, and MinIO credentials, plus whatever backups exist and evidence that a restore has been tested.
- [ ] Answers, or named owners, for every item in the section above.
- [ ] The frontend repository and its owner — several open questions here can only be closed from that side.

Then work through [First Day Checklist](#first-day-checklist) and [Before You Modify the System](#before-you-modify-the-system).
