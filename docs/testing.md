# Testing

This project uses Bun's built-in `bun:test` runner for isolated, HTTP-component, schema, and PostgreSQL integration tests. This page describes the repository as verified on 2026-11-11 on branch `docs/sync-with-staging` (macOS, Bun 1.3.6); it does not imply that the full suite is green. The previous refresh was 2026-09-02, when the repository had 18 test files.

For environment setup and service ports, see [Development](./development.md). For database lifecycle and schema guidance, see [Database](./database.md). Unresolved quality risks are tracked in [Technical debt](./technical-debt.md).

## Current status

- **55 test files and about 736 declared test cases** were found.
- **20 files are isolated** unit, configuration, schema, route-contract, guard, or in-process route tests. None needs PostgreSQL, Redis, MinIO, or SMTP.
- **34 files are `*.integration.test.ts` PostgreSQL tests.**
- **`src/service/evaluator-review.pastyear.test.ts` is an integration test without the suffix.** It probes `DATABASE_URL`, skips when no database answers, and inserts and deletes rows when one does. Treat it like a `*.integration.test.ts` file.
- The 20 isolated files were run together on 2026-11-11 with Bun 1.3.6: **458 passed, 1 skipped, 0 failed across 20 files.** The run count exceeds the declared count because several files generate cases from tables.
- **The guards failure seen earlier on 2026-11-11 is fixed:** `src/middleware/guards.test.ts` › `role guards on every autoloaded route > DOED: PATCH /twhp/api/admins/factories/validate/:id`. The test expects anonymous → 401 and Factory/Provincial/Evaluator → 403, but every caller, anonymous included, gets 400, which the test counts as "past the guard". The route's JSON-only `parse` hook (#65) runs before the role guard and rejects the probe's multipart body. It is not an authorization bypass, because the handler never runs, but a caller without access learns about the body format before it gets 401 or 403. #71 moved the body check after the guard and added `src/routes/admins/factories/index.test.ts` to pin the order ([#69](https://github.com/rawinan-soma/twhp-api/issues/69)).
- The skip is an `it.skipIf(!hostIsBangkok)` case in `src/utils.fiscal-year.test.ts`; it runs only on a host whose time zone is Bangkok.
- The integration tests were **not run** during this refresh. Their setup performs real inserts and deletes against `DATABASE_URL`, whose test preload fallback names the ordinary local `twhp` database.
- `bun run test` is still not usable: the `package.json` script prints `Error: no test specified` and exits 1.
- The read-only Biome check **exits 0** on 2026-11-11: **145 files checked, 0 errors, 48 warnings, 3 infos** (2026-09-02: 86 files, 3 errors, 32 warnings, 3 infos).
- TypeScript status remains unknown. No `node_modules/.bin/tsc` exists and `typescript` is not a declared development dependency.
- No active CI workflow, coverage configuration or threshold, Husky/Lefthook/pre-commit configuration, or non-sample Git hook was found.

Do not summarize the repository as having "no tests," and do not describe the full suite as passing.

## Test inventory

The isolated table gives the number of tests each file **ran** on 2026-11-11 when run alone. The integration table gives **declared** `it(...)`/`test(...)` calls counted in source; a `.each` table counts once.

### Isolated tests (20 files, 442 executed)

| File | Ran | Scope |
|---|---:|---|
| `src/config.test.ts` | 8 | Import-time configuration validation, including development OTP bypass variables |
| `src/middleware/guards.test.ts` | 62 | Every autoloaded route against an access table, for anonymous and each role; runs `src/test/route-access-matrix.ts` in a child process with unreachable backing services. |
| `src/queue/schedule.test.ts` | 1 | The validation-reminder cron pattern and time zone fire on weekdays at 08:30 Bangkok |
| `src/routes/admins/factories/index.test.ts` | 3 (table-driven) | `PATCH /admins/factories/validate/:id` answers 401/403 before it judges the body; DOED gets 400 for a refused body (#71) |
| `src/routes/authentication/index.test.ts` | 22 | In-process Elysia login, OTP, bypass, error, and request-validation behavior with mocked authentication/JWT modules |
| `src/schema/fiscal-year.test.ts` | 14 | `FiscalYearQuery` acceptance, rejection, and composition with pagination |
| `src/service/admin-region-province-routes.test.ts` | 5 | Admin list query contracts for the region and province filters |
| `src/service/auth-dev-bypass.test.ts` | 6 | Fail-closed and constant-time development bypass decision logic |
| `src/service/authentication.2fa.test.ts` | 30 | OTP generation, hashing, TTL, attempts, resend, masking, and role routing with mocked DB/Redis/queue |
| `src/service/coverStatus.test.ts` | 17 | Shared latest-cover-log resolution: ordering by serial `id`, `LIMIT 1`, and both query shapes (ADR-0010) |
| `src/service/evaluation-period.routes.test.ts` | 15 | Staff-list default year, `assertYearWritable`, and the October hard-reject block, with queries recorded through a stubbed pg client |
| `src/service/evaluation-period.test.ts` | 20 | `evaluationPeriodApplies` and `getReviewerFiscalYear`, with and without `EVALUATION_PERIOD_END` |
| `src/service/evaluator-province-routes.test.ts` | 6 | Evaluator list query contracts for the province filter |
| `src/service/factory-closed-year.test.ts` | 6 | Factory write paths refuse a closed fiscal year |
| `src/service/fiscal-year-routes.test.ts` | 50 | Every fiscal-scoped endpoint composes the shared `fiscalYear` parameter |
| `src/service/pagination-routes.test.ts` | 70 | Route-level composition of the envelope, unwrapped 404s, and envelope parity across the nine staff lists |
| `src/service/pagination.test.ts` | 25 | `PaginationQuery`/`PaginatedResponse` contract, coercion, bounds, and `meta` arithmetic (ADR-0007, ADR-0009) |
| `src/service/score.test.ts` | 48 | Score arithmetic, category breakdown, `n/a` handling, grade gates, boundaries, and TypeBox response shape |
| `src/service/verdictEmail.test.ts` | 6 | Verdict-email cc selection and finished-job payload |
| `src/utils.fiscal-year.test.ts` | 28 | Bangkok Sep 30/Oct 1 boundaries, leap years, host-timezone independence, single clock read (1 skipped unless the host is in Bangkok time) |

### PostgreSQL integration tests (35 files, about 492 declared)

| File | Declared | Scope |
|---|---:|---|
| `src/routes/admins/factories/index.authenticated.integration.test.ts` | 24 | `PATCH /admins/factories/validate/:id`: plain approval, Prior Awards, refused bodies, existing `Awards` rows |
| `src/routes/admins/factories/delete.authenticated.integration.test.ts` | 11 | `DELETE /admins/factories/:id`: refusal for `Awards` and `Enrolls`, full removal, 404 for non-Factory ids, a racing insert, the OpenAPI 400, access |
| `src/routes/evaluators/enrolls/index.authenticated.integration.test.ts` | 6 | Evaluator enrollment list province filter through a real token |
| `src/routes/evaluators/factories/index.authenticated.integration.test.ts` | 5 | Evaluator factory list province filter through a real token |
| `src/routes/evaluators/score/index.authenticated.integration.test.ts` | 6 | Evaluator score list province filter through a real token |
| `src/routes/location-session-response.authenticated.integration.test.ts` | 5 | `health_region` on location rows and the session's region |
| `src/routes/token-renewal.authenticated.integration.test.ts` | 4 | Access-token renewal from a refresh token and refresh rotation near expiry |
| `src/service/admin-region-province-filter.integration.test.ts` | 18 | Admin factory and enrollment lists: region and province filters |
| `src/service/answer.integration.test.ts` | 9 | Answer read model, latest-verdict enrichment, and refusal of factory responses to settled score changes |
| `src/service/awards.integration.test.ts` | 22 | `Awards` constraints, one row per finalize, stored-Grade reads, gold-tier history resolver |
| `src/service/concurrent-years.integration.test.ts` | 12 | A Factory holding a prior-year and a current-year enrollment/Cover at once |
| `src/service/dropdown-data.integration.test.ts` | 5 | `health_region` on province dropdown data and the Evaluator's own region |
| `src/service/enroll-score-province-filter.evaluator.integration.test.ts` | 21 | Evaluator enrollment and score lists filtered by province |
| `src/service/enroll.integration.test.ts` | 24 | Latest Cover status, filtering, scope composition, and response schemas |
| `src/service/enroll.lockout.integration.test.ts` | 11 | Gold-tier enrollment lockout |
| `src/service/evaluator-detail-region-scope.integration.test.ts` | 6 | Evaluator factory/enrollment detail reads limited to the Evaluator's region |
| `src/service/evaluator-review.integration.test.ts` | 21 | Reviewer resolution, regional/category scope, province-scoped reviewer context, and provincial redaction |
| `src/service/evaluator-review.pastyear.test.ts` | 12 | Fiscal-year write gate for closed years and the evaluation period (skips without a database) |
| `src/service/evaluator-review.save.integration.test.ts` | 26 | Per-Answer verdict validation, decisions, access, authorship, and immutability |
| `src/service/evaluator-review.standards.integration.test.ts` | 6 | Standard-file filtering and reviewer/admin surface parity |
| `src/service/evaluator-review.verdict.integration.test.ts` | 30 | Finalization gates, promotion, terminal score changes, hard-reject file and certificate deletion, email selection, and transaction behavior |
| `src/service/factory-name-search.integration.test.ts` | 16 | Factory Name Search on the staff lists: Thai/English substrings, letter case, whole-term matching |
| `src/service/factory-pagination.integration.test.ts` | 29 | Paginated factory lists, total ordering, page boundaries, and the account-email column |
| `src/service/factory-province-detail.integration.test.ts` | 4 | Provincial Officer factory detail: in-province read and identical 404 otherwise |
| `src/service/factory-region-province-filter.evaluator.integration.test.ts` | 13 | Evaluator factory list filtered by province within the region |
| `src/service/fiscal-year-addressing.integration.test.ts` | 19 | Query and role scoping for an addressed fiscal year |
| `src/service/invitation.integration.test.ts` | 17 | Creating and accepting an Evaluator Invitation, refusals, route access (ADR-0015) |
| `src/service/invitation.pending-actions.integration.test.ts` | 22 | Resend, email correction, and cancel of a pending Invitation |
| `src/service/invitation.provincial.integration.test.ts` | 11 | Provincial Officer Invitations and the accepted Officer |
| `src/service/pagination-contract.integration.test.ts` | 6 | Cross-endpoint envelope and `meta` consistency for the nine staff lists |
| `src/service/profile-update.integration.test.ts` | 14 | Profile updates write only supplied fields, atomically, with hashed passwords |
| `src/service/score-pagination.integration.test.ts` | 25 | Paginated score reports with page-scoped answer hydration (ADR-0011) |
| `src/service/score.integration.test.ts` | 16 | Cover readiness and regional/provincial/admin score queries |
| `src/service/staff.integration.test.ts` | 13 | Admin staff list: access, who is listed, Invitation status, no secrets |
| `src/test/authenticated-request.integration.test.ts` | 3 | The `authenticatedRequest` harness itself: wrong-role 403, PATCH bodies, queued-job capture |

## Safely running the isolated tests

All 20 isolated files run in one process:

```bash
bun test src/config.test.ts src/middleware/guards.test.ts src/queue/schedule.test.ts \
  src/routes/admins/factories/index.test.ts \
  src/routes/authentication/index.test.ts src/schema/fiscal-year.test.ts \
  src/service/admin-region-province-routes.test.ts src/service/auth-dev-bypass.test.ts \
  src/service/authentication.2fa.test.ts src/service/coverStatus.test.ts \
  src/service/evaluation-period.routes.test.ts src/service/evaluation-period.test.ts \
  src/service/evaluator-province-routes.test.ts src/service/factory-closed-year.test.ts \
  src/service/fiscal-year-routes.test.ts src/service/pagination-routes.test.ts \
  src/service/pagination.test.ts src/service/score.test.ts src/service/verdictEmail.test.ts \
  src/utils.fiscal-year.test.ts
```

Observed on 2026-11-11 with Bun 1.3.6 on macOS: **458 pass, 1 skip, 0 fail.** The run can print `[ioredis] Unhandled error event` lines because module-level imports create a Redis client that finds no server; they do not fail the run.

### Mock leakage between files

`mock.module(...)` replacements are process-global and Bun never restores them, so one file's stub is visible to every file that loads after it in the same run. Bun loads files in filesystem order, not command-line order, so the result can differ between machines:

- `src/service/auth-dev-bypass.test.ts` replaces `../utils` with `{ redisConnector: {}, utilities: () => ({}) }`. When it loads before `src/service/evaluation-period.test.ts`, the 8 `getReviewerFiscalYear` tests in that file fail. This was seen on Linux; on macOS on 2026-11-11 the combined run passed them. Each file passes alone.
- `src/service/authentication.2fa.test.ts` replaces `../utils`, `../queue/email`, `../drizzle`, and `../config` in the same way.

If a test fails in the combined run but passes alone, suspect leakage first and fall back to one process per file:

```bash
for f in src/config.test.ts src/middleware/guards.test.ts src/queue/schedule.test.ts \
  src/routes/admins/factories/index.test.ts \
  src/routes/authentication/index.test.ts src/schema/fiscal-year.test.ts \
  src/service/admin-region-province-routes.test.ts src/service/auth-dev-bypass.test.ts \
  src/service/authentication.2fa.test.ts src/service/coverStatus.test.ts \
  src/service/evaluation-period.routes.test.ts src/service/evaluation-period.test.ts \
  src/service/evaluator-province-routes.test.ts src/service/factory-closed-year.test.ts \
  src/service/fiscal-year-routes.test.ts src/service/pagination-routes.test.ts \
  src/service/pagination.test.ts src/service/score.test.ts src/service/verdictEmail.test.ts \
  src/utils.fiscal-year.test.ts; do bun test "$f"; done
```

`guards.test.ts` and `authenticatedRequest` run their app in a child process for the same reason.

Results are point-in-time evidence, not a substitute for running the commands after a change.

## Integration-test safety

`bunfig.toml` preloads `src/test/setup.ts` for every Bun test process. The preload uses `??=` fallbacks for PostgreSQL, Redis, SMTP, JWT/cookies, frontend, and MinIO configuration. It does not start dependencies, create a database, push the schema, or seed reference data.

The database fallback points to PostgreSQL on `localhost:5433` and database `twhp`. Every integration file creates a real `pg.Pool` from `Bun.env.DATABASE_URL`, then inserts and deletes rows in lifecycle hooks. Therefore:

> Do not run bare `bun test`, any `*.integration.test.ts` file, or `src/service/evaluator-review.pastyear.test.ts` until `DATABASE_URL` is confirmed to name a disposable, migrated, seeded test database.

Some files (for example `evaluator-review.pastyear.test.ts` and `factory-province-detail.integration.test.ts`) skip when no database answers. That is a reachability check, not a safety check: they still write to whatever database does answer. The suite currently has no `TEST_DATABASE_URL`, database-name safety check, `NODE_ENV=test` guard, per-run database/schema, or rollback harness. Integration fixtures also depend on seeded reference rows, including evaluator ID `78`, province ID `10`, and selected question IDs.

Fixture cleanup is only partially hermetic. Tests reserve high account IDs and delete matching prior rows, but an interrupted process can leave data behind. Some files append state across tests and rely on latest-ID and execution-order behavior. Several evaluator suites import and close the shared BullMQ queue singleton. Full-suite parallel safety has not been established.

See [Database](./database.md) before provisioning an integration-test database. The recommended future design is an ephemeral PostgreSQL service plus a unique database or schema per run, with an explicit `TEST_DATABASE_URL` and a fail-closed test-database guard.

### Authenticated route tests

`src/test/authenticated-request.ts` tests a protected route with a real access token. Its `authenticatedRequest` sends one request (GET by default, or POST, PATCH, or DELETE with a JSON `body`, or a `rawBody` with `headers` for a body that is not valid JSON) through the real route module, `jwtPlugin`, guards, and database. `signAccessToken` issues the token. `seedEvaluatorAccount`, `seedAdminAccount`, and `seedProvincialOfficerAccount` create callers of each staff role. Remove a Provincial Officer caller with `removeProvincialOfficerAccount`, because `provincialOfficers.accountId` is `onDelete: restrict` and `removeAccount` alone fails. For an example, see `src/routes/evaluators/factories/index.authenticated.integration.test.ts`.

`authenticatedRequest` runs the request in a child process (`src/test/handle-request.ts`). Other test files call `mock.module` on the configuration, utilities, and database client, and Bun does not restore those mocks between files. An in-process app would see the stubs.

The child stubs the email queue, so no route enqueues into Redis and no worker runs. Each job the request added is returned in `queuedEmails` as `{ name, data, opts }`, which lets a test read a token out of `data` and send it in a second request. A route that calls `redisConnector` directly still needs a reachable Redis at `REDIS_HOST` and `REDIS_PORT`.

These tests write to `DATABASE_URL`, so the database rules above apply. The child process mounts the route without the root app's error handler, so a validation failure returns Elysia's default `422` instead of the deployed `400`.

## Static checks

The package `format`, `lint`, and `check` scripts all pass `--write`, so they are not read-only verification commands. A safe diagnostic command is:

```bash
bun ./node_modules/.bin/biome check src
```

On 2026-11-11 that command checked 145 files and **exited 0 with 0 errors, 48 warnings, and 3 infos** (2026-09-02: 86 files, exit 1, 3 errors, 32 warnings, 3 infos; 2026-07-15: 77 files, 8 errors, 30 warnings, 3 infos). The error gate is now green, but the warnings remain, so report baseline versus introduced diagnostics rather than claiming a clean lint result.

Type-checking is not currently reproducible from installed direct dependencies:

```text
bunx tsc --noEmit
error: bun is unable to write files to tempdir: PermissionDenied
```

Setting `TMPDIR=/private/tmp` produced the same pre-execution failure. `node_modules/.bin/tsc` is
still absent as of 2026-11-11 and `typescript` is still not a declared development dependency. Pin
`typescript` and add a non-mutating `typecheck` script before treating type-checking as an enforced
gate.

## What is covered

- Development OTP bypass parsing and fail-closed decision logic.
- Staff 2FA role routing, OTP policy, hashing, TTL, attempt limits, resend throttling, masking, and route response paths using mocks.
- Score calculation, `n/a` exclusion, category aggregation, numeric boundaries, and nested response schemas.
- The shared latest-cover-log resolution: serial-`id` ordering, the correctness role of `LIMIT 1`, and parity between the lateral and single-cover shapes (ADR-0010).
- The offset-pagination contract: query coercion and bounds, `meta` arithmetic, envelope composition at the route layer, and envelope parity across the nine staff lists (ADR-0007, ADR-0009).
- Role guards on every autoloaded route, for anonymous and each role, against an access table (`src/middleware/guards.test.ts`).
- The fiscal-year query parameter, the evaluation period, the closed-year Factory write block, and the weekday reminder schedule.
- Factory deletion: refusal for a Factory with history, full removal, and 404 for any id that is not a Factory, including an insert that races the delete.
- At the integration-test source level: Cover-status filters, score queries and page-scoped answer hydration, evaluator regional/category reads and detail-read region scope, province and region filters, Factory Name Search, per-Answer verdict editing, terminal score changes and hard-reject certificate deletion (ADR-0012), finalization outcomes and atomicity, `Awards` and gold-tier history (ADR-0014), Prior Awards on factory approval, staff Invitations and the staff list (ADR-0015), partial atomic profile updates, token renewal, answer verdict enrichment, standard-file filtering, and paginated factory/enrollment/score lists.

The integration bullet describes existing test source, not a current passing result.

## High-risk gaps

| Area | Missing or partial coverage |
|---|---|
| Authentication and authorization | **Partly covered.** `guards.test.ts` checks anonymous 401 and cross-role 403 on every autoloaded route through `requireRoles` and the composed guards; `token-renewal.authenticated.integration.test.ts` covers refresh renewal and rotation. Still missing: cookie attributes/clearing, refresh revocation, and refresh-JWT signature verification |
| Password/session flows | Password reset, password change, logout, token expiry/replay/account binding, and session invalidation |
| Full application behavior | Global 400/404/500 mapping, logging, response validation, route autoload, and OpenAPI completeness; the auth component test sees raw Elysia 422 rather than exercising the app's claimed 400 mapping |
| Fiscal year | **Covered.** `src/utils.fiscal-year.test.ts` asserts the Bangkok Sep 30/Oct 1 boundaries, leap-year spans, host-timezone independence, single clock read, and parity with the pre-2026 algorithm. `src/service/fiscal-year-addressing.integration.test.ts` covers query scoping and role scoping for an addressed year; `src/service/fiscal-year-routes.test.ts` proves all 13 fiscal-scoped endpoints compose the shared parameter |
| Updates and concurrency | Double-submit, concurrent finalizers, idempotency, stale writes, uniqueness/conflict paths, and transaction rollback under races |
| Files and external services | Answer/enrollment upload replacement and compensation, real MinIO behavior, Redis integration, BullMQ processing/retry, SMTP failure, and the worker's scheduler registration (only the cron pattern and time zone are tested) |
| Untested domains | Standalone behavior for Cover, file, and question services; admin, evaluator, factory, location, and provincial-officer services are covered only for the list filters, detail scoping, factory approval, factory deletion, and profile updates listed above |

Prioritize auth/RBAC, fiscal-year boundaries, concurrency/idempotency, and destructive file/update workflows. See [Technical debt](./technical-debt.md) for the consolidated risk backlog.

## Recommended quality-gate design

1. Make `bun run test` execute only deterministic isolated tests, or clearly provision every dependency it needs. Never let the default command silently mutate a development database.
2. Add explicit `test:unit` and `test:integration` scripts. Require `TEST_DATABASE_URL` for the latter.
3. Add read-only `format:check`, `lint:check`, and pinned `typecheck` scripts.
4. In CI, run isolated tests and static checks first; run integration tests against an ephemeral, migrated, seeded PostgreSQL service.
5. Add dedicated Redis/MinIO/SMTP contract or end-to-end jobs rather than making every service test depend on live infrastructure.
6. Introduce coverage reporting only after safe suite partitioning, with risk-based line and branch thresholds. No coverage percentage is currently known.
