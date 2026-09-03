# Testing

This project uses Bun's built-in `bun:test` runner for isolated, HTTP-component, schema, and PostgreSQL integration tests. This page describes the repository as verified on 2026-09-02 on branch `dev`; it does not imply that the full suite is green.

For environment setup and service ports, see [Development](./development.md). For database lifecycle and schema guidance, see [Database](./database.md). Unresolved quality risks are tracked in [Technical debt](./technical-debt.md).

## Current status

- **18 test files and 315 declared test cases** were found.
- **8 files are isolated** unit, configuration, schema, pagination, or in-process route tests.
- **10 files are PostgreSQL integration tests.**
- The eight isolated files were run together on 2026-09-02 with Bun 1.3.6: **201 passed, 0 failed,
  489 `expect()` calls, 408 ms**. The run count exceeds the declared count because several files
  generate cases from tables.
- The integration tests were **not run** during this refresh. Their setup performs real inserts and
  deletes against `DATABASE_URL`, whose test preload fallback names the ordinary local `twhp`
  database.
- `bun run test` is still not usable: the `package.json` script prints `Error: no test specified` and
  exits 1.
- The read-only Biome check was red on 2026-09-02: **86 files checked, 3 errors, 32 warnings, 3
  infos** (improved from 8 errors on 2026-07-15; the warning count rose with the new test files).
- TypeScript status remains unknown. No `node_modules/.bin/tsc` exists and `typescript` is not a
  declared development dependency.
- No active CI workflow, coverage configuration or threshold, Husky/Lefthook/pre-commit
  configuration, or non-sample Git hook was found.

Do not summarize the repository as having "no tests," and do not describe the full suite as passing.

## Test inventory

Counts are declared `it(...)`/`test(...)` cases in each file.

### Isolated tests (8 files, 140 declared / 201 executed)

| File | Cases | Scope |
|---|---:|---|
| `src/config.test.ts` | 4 | Import-time configuration validation for development OTP bypass variables |
| `src/service/auth-dev-bypass.test.ts` | 6 | Fail-closed and constant-time development bypass decision logic |
| `src/service/authentication.2fa.test.ts` | 30 | OTP generation, hashing, TTL, attempts, resend, masking, and role routing with mocked DB/Redis/queue |
| `src/routes/authentication/index.test.ts` | 22 | In-process Elysia login, OTP, bypass, error, and request-validation behavior with mocked authentication/JWT modules |
| `src/service/coverStatus.test.ts` | 17 | Shared latest-cover-log resolution: ordering by serial `id`, `LIMIT 1`, and both query shapes (ADR-0010) |
| `src/service/pagination.test.ts` | 25 | `PaginationQuery`/`PaginatedResponse` contract, coercion, bounds, and `meta` arithmetic (ADR-0007, ADR-0009) |
| `src/service/pagination-routes.test.ts` | 9 | Route-level composition of the envelope, unwrapped 404s, and envelope parity across the nine staff lists |
| `src/service/score.test.ts` | 27 | Score arithmetic, category breakdown, `n/a` handling, boundaries, and TypeBox response shape |

### PostgreSQL integration tests (10 files, 175 declared)

| File | Cases | Scope |
|---|---:|---|
| `src/service/answer.integration.test.ts` | 9 | Answer read model, latest-verdict enrichment, and explicit evidence-file deletion on PATCH |
| `src/service/enroll.integration.test.ts` | 18 | Latest Cover status, filtering, scope composition, and response schemas |
| `src/service/evaluator-review.integration.test.ts` | 10 | Reviewer resolution, regional/category scope, and admin read behavior |
| `src/service/evaluator-review.save.integration.test.ts` | 26 | Per-Answer verdict validation, decisions, access, authorship, and immutability |
| `src/service/evaluator-review.standards.integration.test.ts` | 6 | Standard-file filtering and reviewer/admin surface parity |
| `src/service/evaluator-review.verdict.integration.test.ts` | 30 | Finalization gates, promotion, terminal score changes, hard-reject file and certificate deletion, email selection, and transaction behavior |
| `src/service/factory-pagination.integration.test.ts` | 29 | Paginated factory lists, total ordering, page boundaries, and the account-email column |
| `src/service/pagination-contract.integration.test.ts` | 6 | Cross-endpoint envelope and `meta` consistency for the nine staff lists |
| `src/service/score-pagination.integration.test.ts` | 25 | Paginated score reports with page-scoped answer hydration (ADR-0011) |
| `src/service/score.integration.test.ts` | 16 | Cover readiness and regional/provincial/admin score queries |

## Safely running the isolated tests

All eight isolated files run cleanly in one process:

```bash
bun test src/config.test.ts src/routes/authentication/index.test.ts \
  src/service/auth-dev-bypass.test.ts src/service/authentication.2fa.test.ts \
  src/service/coverStatus.test.ts src/service/pagination-routes.test.ts \
  src/service/pagination.test.ts src/service/score.test.ts
```

Observed on 2026-09-02 with Bun 1.3.6: **201 pass, 0 fail, 489 expect() calls, 408 ms.** The run
prints `[ioredis] Unhandled error event` lines because module-level imports create a Redis client
that finds no server; they do not fail the run.

If mock contamination reappears, fall back to one process per file — repository history records that
the authentication files register overlapping top-level `mock.module(...)` replacements and once
needed separation:

```bash
bun test src/config.test.ts
bun test src/service/auth-dev-bypass.test.ts
bun test src/service/authentication.2fa.test.ts
bun test src/routes/authentication/index.test.ts
bun test src/service/coverStatus.test.ts
bun test src/service/pagination.test.ts
bun test src/service/pagination-routes.test.ts
bun test src/service/score.test.ts
```

Results are point-in-time evidence, not a substitute for running the commands after a change.

## Integration-test safety

`bunfig.toml` preloads `src/test/setup.ts` for every Bun test process. The preload uses `??=` fallbacks for PostgreSQL, Redis, SMTP, JWT/cookies, frontend, and MinIO configuration. It does not start dependencies, create a database, push the schema, or seed reference data.

The database fallback points to PostgreSQL on `localhost:5433` and database `twhp`. Every integration file creates a real `pg.Pool` from `Bun.env.DATABASE_URL`, then inserts and deletes rows in lifecycle hooks. Therefore:

> Do not run bare `bun test` or any `*.integration.test.ts` file until `DATABASE_URL` is confirmed to name a disposable, migrated, seeded test database.

The suite currently has no `TEST_DATABASE_URL`, database-name safety check, `NODE_ENV=test` guard, per-run database/schema, or rollback harness. Integration fixtures also depend on seeded reference rows, including evaluator ID `78`, province ID `10`, and selected question IDs.

Fixture cleanup is only partially hermetic. Tests reserve high account IDs and delete matching prior rows, but an interrupted process can leave data behind. Some files append state across tests and rely on latest-ID and execution-order behavior. Several evaluator suites import and close the shared BullMQ queue singleton. Full-suite parallel safety has not been established.

See [Database](./database.md) before provisioning an integration-test database. The recommended future design is an ephemeral PostgreSQL service plus a unique database or schema per run, with an explicit `TEST_DATABASE_URL` and a fail-closed test-database guard.

## Static checks

The package `format`, `lint`, and `check` scripts all pass `--write`, so they are not read-only verification commands. A safe diagnostic command is:

```bash
bun ./node_modules/.bin/biome check src
```

On 2026-09-02 that command checked 86 files and exited 1 with **3 errors, 32 warnings, and 3 infos** (2026-07-15: 77 files, 8 errors, 30 warnings, 3 infos). Reported categories include import ordering, formatting, a thenable mock, explicit `any`, and non-null assertions in tests; almost all remaining findings are in `*.test.ts` files. This is still a failing quality gate, not a clean lint result.

Type-checking is not currently reproducible from installed direct dependencies:

```text
bunx tsc --noEmit
error: bun is unable to write files to tempdir: PermissionDenied
```

Setting `TMPDIR=/private/tmp` produced the same pre-execution failure. `node_modules/.bin/tsc` is
still absent as of 2026-09-02 and `typescript` is still not a declared development dependency. Pin
`typescript` and add a non-mutating `typecheck` script before treating type-checking as an enforced
gate.

## What is covered

- Development OTP bypass parsing and fail-closed decision logic.
- Staff 2FA role routing, OTP policy, hashing, TTL, attempt limits, resend throttling, masking, and route response paths using mocks.
- Score calculation, `n/a` exclusion, category aggregation, numeric boundaries, and nested response schemas.
- The shared latest-cover-log resolution: serial-`id` ordering, the correctness role of `LIMIT 1`, and parity between the lateral and single-cover shapes (ADR-0010).
- The offset-pagination contract: query coercion and bounds, `meta` arithmetic, envelope composition at the route layer, and envelope parity across the nine staff lists (ADR-0007, ADR-0009).
- At the integration-test source level: Cover-status filters, score queries and page-scoped answer hydration, evaluator regional/category reads, per-Answer verdict editing, terminal score changes and hard-reject certificate deletion (ADR-0012), finalization outcomes and atomicity, answer verdict enrichment, explicit evidence deletion on PATCH, standard-file filtering, and paginated factory/enrollment/score lists.

The integration bullet describes existing test source, not a current passing result.

## High-risk gaps

| Area | Missing or partial coverage |
|---|---|
| Authentication and authorization | Real `jwtPlugin`, access/refresh verification and rotation, cookie attributes/clearing, refresh revocation, `requireRoles`, all composed guards, cross-role 401/403, and autoload/lifecycle scoping |
| Password/session flows | Password reset, password change, logout, token expiry/replay/account binding, and session invalidation |
| Full application behavior | Global 400/404/500 mapping, logging, response validation, route autoload, and OpenAPI completeness; the auth component test sees raw Elysia 422 rather than exercising the app's claimed 400 mapping |
| Fiscal year | Bangkok-time Sep 30/Oct 1 boundaries, leap-year behavior, host-timezone independence, and correct query scoping across enroll/Cover/answer/score/factory services |
| Updates and concurrency | Double-submit, concurrent finalizers, idempotency, stale writes, uniqueness/conflict paths, and transaction rollback under races |
| Files and external services | Answer/enrollment upload replacement and compensation, real MinIO behavior, Redis integration, BullMQ processing/retry, SMTP failure, and repeat-job scheduling |
| Untested domains | Standalone behavior for admin, Cover, evaluator, factory, file, location, provincial-officer, and question services and guarded routes |

Prioritize auth/RBAC, fiscal-year boundaries, concurrency/idempotency, and destructive file/update workflows. See [Technical debt](./technical-debt.md) for the consolidated risk backlog.

## Recommended quality-gate design

1. Make `bun run test` execute only deterministic isolated tests, or clearly provision every dependency it needs. Never let the default command silently mutate a development database.
2. Add explicit `test:unit` and `test:integration` scripts. Require `TEST_DATABASE_URL` for the latter.
3. Add read-only `format:check`, `lint:check`, and pinned `typecheck` scripts.
4. In CI, run isolated tests and static checks first; run integration tests against an ephemeral, migrated, seeded PostgreSQL service.
5. Add dedicated Redis/MinIO/SMTP contract or end-to-end jobs rather than making every service test depend on live infrastructure.
6. Introduce coverage reporting only after safe suite partitioning, with risk-based line and branch thresholds. No coverage percentage is currently known.
