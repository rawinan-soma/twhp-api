# Testing

This project uses Bun's built-in `bun:test` runner for isolated, HTTP-component, schema, and PostgreSQL integration tests. The test-file inventory was refreshed directly from source on 2026-07-21; environment and tooling audit results remain point-in-time evidence from 2026-07-15 unless dated otherwise. This page does not imply that the full suite is green.

For environment setup and service ports, see [Development](./development.md). For database lifecycle and schema guidance, see [Database](./database.md). Unresolved quality risks are tracked in [Technical debt](./technical-debt.md).

## Current status

- **14 test files and 182 declared tests** were found by counting `it(...)`/`test(...)` declarations in current test source.
- **95 tests in 7 files** are isolated unit, configuration, schema, or in-process route tests.
- **87 tests in 7 files** are PostgreSQL integration tests.
- The five pre-existing isolated files were run separately during the 2026-07-15 audit: **86 passed, 0 failed, with 192 `expect()` calls**. The two new Answer schema/planner suites were run together on 2026-07-21: **9 passed, 0 failed, with 50 `expect()` calls**.
- The 87 integration tests, including the six expanded Answer deletion cases, were **not run here**. Their setup performs real inserts and deletes against `DATABASE_URL`, whose test preload fallback names the ordinary local `twhp` database.
- `bun run test` is not usable: the `package.json` script prints `Error: no test specified` and exits 1.
- The observed repository-wide read-only Biome check was red: **8 errors, 30 warnings, and 3 infos**.
- Current TypeScript status is unknown. No local `node_modules/.bin/tsc` exists, and both attempted `bunx tsc --noEmit` commands failed before type-checking with a Bun temporary-directory permission error.
- No active CI workflow, coverage configuration or threshold, Husky/Lefthook/pre-commit configuration, or non-sample Git hook was found.

Do not summarize the repository as having “no tests,” and do not describe the full suite as passing.

## Test inventory

### Isolated and component tests

| File | Tests | Scope |
|---|---:|---|
| `src/config.test.ts` | 4 | Import-time configuration validation for development OTP bypass variables |
| `src/service/auth-dev-bypass.test.ts` | 6 | Fail-closed and constant-time development bypass decision logic |
| `src/service/authentication.2fa.test.ts` | 30 | OTP generation, hashing, TTL, attempts, resend, masking, and role routing with mocked DB/Redis/queue |
| `src/routes/authentication/index.test.ts` | 22 | In-process Elysia login, OTP, bypass, error, and request-validation behavior with mocked authentication/JWT modules |
| `src/service/score.test.ts` | 24 | Score arithmetic, category breakdown, `n/a` handling, boundaries, and TypeBox response shape |
| `src/schema/answer.test.ts` | 4 | Multipart deletion-flag decoding, optionality, invalid values, and correspondence with planner slot keys |
| `src/service/answer-file-update.test.ts` | 5 | Pure file-plan keep/delete/conflict/replace/projected-state and `special=3` implicit-clearing behavior |

### PostgreSQL integration tests

| File | Tests | Scope |
|---|---:|---|
| `src/service/answer.integration.test.ts` | 9 | Answer read model/latest-verdict enrichment plus optional explicit deletion, required-evidence and upload/delete pre-I/O rejection, `rejected`-status gating, `special=3` eligibility, and strict-delete DB/log preservation source cases |
| `src/service/enroll.integration.test.ts` | 12 | Latest Cover status, filtering, scope composition, and response schemas |
| `src/service/evaluator-review.integration.test.ts` | 10 | Reviewer resolution, regional/category scope, and admin read behavior |
| `src/service/evaluator-review.save.integration.test.ts` | 19 | Per-Answer verdict validation, decisions, access, authorship, and immutability |
| `src/service/evaluator-review.standards.integration.test.ts` | 6 | Standard-file filtering and reviewer/admin surface parity |
| `src/service/evaluator-review.verdict.integration.test.ts` | 16 | Finalization gates, promotion, outcomes, file deletion, email selection, and transaction behavior |
| `src/service/score.integration.test.ts` | 15 | Cover readiness and regional/provincial/admin score queries |

## Safely running the isolated tests

Run the authentication-related files in separate Bun processes. They register overlapping top-level `mock.module(...)` replacements, and repository history records that separation was needed to avoid mock contamination.

```bash
bun test src/config.test.ts
bun test src/service/auth-dev-bypass.test.ts
bun test src/service/authentication.2fa.test.ts
bun test src/routes/authentication/index.test.ts
bun test src/service/score.test.ts
bun test src/schema/answer.test.ts
bun test src/service/answer-file-update.test.ts
```

These are the exact observed results using Bun 1.3.6; dates distinguish the original audit from the added suites:

| Command | Date | Observed result |
|---|---|---|
| `bun test src/config.test.ts` | 2026-07-15 | 4 pass, 0 fail, 8 expects, 145 ms |
| `bun test src/service/auth-dev-bypass.test.ts` | 2026-07-15 | 6 pass, 0 fail, 11 expects, 53 ms |
| `bun test src/service/authentication.2fa.test.ts` | 2026-07-15 | 30 pass, 0 fail, 64 expects, 43 ms |
| `bun test src/routes/authentication/index.test.ts` | 2026-07-15 | 22 pass, 0 fail, 61 expects, 51 ms |
| `bun test src/service/score.test.ts` | 2026-07-15 | 24 pass, 0 fail, 48 expects, 26 ms |
| `bun test src/schema/answer.test.ts src/service/answer-file-update.test.ts` | 2026-07-21 | 9 pass, 0 fail, 50 expects, 166 ms |

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

The 2026-07-15 audit ran that command without fixes. It checked 77 files and exited 1 with 8 errors, 30 warnings, and 3 infos. Reported categories included import ordering, formatting, a thenable mock, an unnecessary `flatMap`, explicit `any`, and non-null assertions in tests. This is a failing quality gate, not a clean lint result.

Type-checking is not currently reproducible from installed direct dependencies:

```text
bunx tsc --noEmit
error: bun is unable to write files to tempdir: PermissionDenied
```

Setting `TMPDIR=/private/tmp` produced the same pre-execution failure, and `node_modules/.bin/tsc` was absent. Pin `typescript` as a development dependency and add a non-mutating `typecheck` script before treating type-checking as an enforced gate.

## What is covered

- Development OTP bypass parsing and fail-closed decision logic.
- Staff 2FA role routing, OTP policy, hashing, TTL, attempt limits, resend throttling, masking, and route response paths using mocks.
- Score calculation, `n/a` exclusion, category aggregation, numeric boundaries, and nested response schemas.
- Answer multipart deletion-flag decoding and pure file-update planning without external services.
- At the integration-test source level: Cover-status filters, score queries, evaluator regional/category reads, per-Answer verdict editing, finalization outcomes and atomicity, answer verdict enrichment, standard-file filtering, and six explicit Answer evidence-deletion cases.

The integration bullet describes existing test source, not a current passing result.

## High-risk gaps

| Area | Missing or partial coverage |
|---|---|
| Authentication and authorization | Real `jwtPlugin`, access/refresh verification and rotation, cookie attributes/clearing, refresh revocation, `requireRoles`, all composed guards, cross-role 401/403, and autoload/lifecycle scoping |
| Password/session flows | Password reset, password change, logout, token expiry/replay/account binding, and session invalidation |
| Full application behavior | Global 400/404/500 mapping, logging, response validation, route autoload, and OpenAPI completeness; the auth component test sees raw Elysia 422 rather than exercising the app's claimed 400 mapping |
| Fiscal year | Bangkok-time Sep 30/Oct 1 boundaries, leap-year behavior, host-timezone independence, and correct query scoping across enroll/Cover/answer/score/factory services |
| Updates and concurrency | Double-submit, concurrent finalizers, idempotency, stale writes, uniqueness/conflict paths, and transaction rollback under races |
| Files and external services | Answer/enrollment upload replacement and compensation; Answer deletion with matching standards, `recommended`/`finished` latest statuses, already-empty slots, every required `_1` evidence anchor, successful AnswerLog append/count, direct execution of ignored uploads plus prior-file clearing for non-selected `special=3` rows, and physical MinIO object verification; Redis integration, BullMQ processing/retry, SMTP failure, and repeat-job scheduling |
| Untested domains | Standalone behavior for admin, Cover, evaluator, factory, file, location, provincial-officer, and question services and guarded routes |

Prioritize auth/RBAC, fiscal-year boundaries, concurrency/idempotency, and destructive file/update workflows. See [Technical debt](./technical-debt.md) for the consolidated risk backlog.

## Recommended quality-gate design

1. Make `bun run test` execute only deterministic isolated tests, or clearly provision every dependency it needs. Never let the default command silently mutate a development database.
2. Add explicit `test:unit` and `test:integration` scripts. Require `TEST_DATABASE_URL` for the latter.
3. Add read-only `format:check`, `lint:check`, and pinned `typecheck` scripts.
4. In CI, run isolated tests and static checks first; run integration tests against an ephemeral, migrated, seeded PostgreSQL service.
5. Add dedicated Redis/MinIO/SMTP contract or end-to-end jobs rather than making every service test depend on live infrastructure.
6. Introduce coverage reporting only after safe suite partitioning, with risk-based line and branch thresholds. No coverage percentage is currently known.
