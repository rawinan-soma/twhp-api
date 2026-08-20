# Test Report — Evaluation Module

> Thai version: [รายงานผลการทดสอบ — โมดูลการประเมิน](./test-report-th.md)

| Field | Value |
|---|---|
| Document ID | `TWHP-TR-EVAL-001` |
| System | TWHP API (`twhp-elysia`) — Bun + ElysiaJS + PostgreSQL |
| Module under test | Evaluation (Evaluator Review — two-phase review, finalize, grading) |
| Report date | 2026-08-17 |
| Repository state | branch `main`, last commit `cd101ac` (2026-07-16), 5 modified + 4 untracked paths |
| Runner | `bun:test` (Bun 1.3.6) |
| Prepared by | Claude Code, compiled from test sources and recorded bolt evidence |
| Status | Compiled — **no suite was executed for this report** |

> **Evidence statement.** All pass/fail figures in this report are point-in-time results recorded in `memory-bank/bolts/*/ddd-03-test-report.md` on the dates shown. They are not a claim about the suite's state today. See §3 and §11.

---

## 1. Purpose and Scope

This report states the verified test position of the Evaluation module: what is covered by executable tests, what was only verified by static review, what has been observed to pass, and which risks remain uncovered.

**In scope**

| Area | Source |
|---|---|
| Reviewer-context seam and cover access (region / existence-only) | `src/service/evaluator-review.ts` |
| Cover-review read (`getAnswers`, category scope, standard files) | `src/service/evaluator-review.ts` |
| Per-Answer verdict save (`saveAnswerVerdict`) | `src/service/evaluator-review.ts` |
| ODPC finalize, promotion, Cover transition, deferred file deletion | `src/service/evaluator-review.ts` |
| Evaluator and admin route surfaces | `src/routes/evaluators/**`, `src/routes/admins/**` |
| Verdict enrichment on the factory read path | `src/service/answer.ts` |
| Grade computation and Grade exposure on score surfaces | `src/service/score.ts`, `src/schema/score.ts` |

**Out of scope** — authentication and 2FA, enrollment, file service, location, question, and provincial-officer domains. Factory negotiation (`negotiate`) and the re-submit gate are in scope only as static evidence (§6.1); they have no executable tests.

## 2. Module Under Test

The Evaluation module implements a two-phase review, established across bolts 006–023:

1. **Phase 1 — per-Answer save.** A scoped reviewer records `approve`, `change_score`, or `reject` on a single Answer. `approve` always writes `recommended`, never `finished` — including for ODPC (invariant FR-5). No Cover transition and no email occur on this path.
2. **Phase 2 — ODPC finalize.** An ODPC evaluator or DOED admin resolves the whole Cover: un-overridden `recommended` Answers are promoted to `finished`, files for Answers rejected at finalize are deleted, one `coverLogs` row is written (`finished` or `in_progress`), a Grade is computed for a finished Cover, and exactly one factory email is enqueued.

Legacy batch verdict routes and `VerdictBatchSchema` were removed in bolt 021.

## 3. Test Environment

| Item | Value |
|---|---|
| Runner | `bun:test`, Bun 1.3.6 |
| Preload | `src/test/setup.ts` via `bunfig.toml` (`??=` env fallbacks only) |
| Database | Real PostgreSQL from `DATABASE_URL`; fallback is `localhost:5433/twhp` |
| External services | Redis and MinIO required by the live stack; `emailQueue.add` and strict MinIO delete are stubbed with `spyOn` |
| Seeded dependencies | Evaluator ID 78, province ID 10, and specific question IDs must exist |
| Docker status on report date | **Down** — `docker compose ps` failed to reach the daemon |

**Execution constraint.** The Evaluation module's tests are PostgreSQL integration tests that insert and delete real rows. `docs/testing.md` prohibits running them until `DATABASE_URL` is confirmed to name a disposable, migrated, seeded database; there is no `TEST_DATABASE_URL`, no database-name guard, and no rollback harness. With the Docker stack down and no disposable database confirmed, **no suite was executed to produce this report**.

## 4. Test Approach and Levels

| Level | Applied | Notes |
|---|---|---|
| Unit | Partial | Only `score.test.ts` (pure arithmetic, Grade schema) and `adminReviewerContext` are genuinely isolated |
| Service integration | Primary level | All Evaluation behaviour is asserted through the service against real PostgreSQL — the project convention |
| Route / HTTP | Minimal | Bolt 021 used live-app boot plus six unauthenticated HTTP probes to prove registration, guard attachment, and batch-route removal |
| Static AC review | Bolts 006–010 only | Code review against acceptance criteria, before any runner existed |
| Security | Embedded | Category scope (403), authorship guard (403/400), region access (404), ODPC-only finalize (403) are asserted inside the integration suites |
| Performance | Not applicable | No NFR performance target defined for this module |
| Coverage measurement | **None** | No coverage configuration or threshold exists; AC-to-test mapping is the only completeness measure |

Test cases are derived from story acceptance criteria only, and test names cite the AC they cover.

## 5. Test Inventory

Counted from source on 2026-08-17.

### 5.1 Core Evaluation suites

| File | Cases | Scope |
|---|---:|---|
| `src/service/evaluator-review.integration.test.ts` | 10 | Reviewer-context seam, region and category scope, admin read parity |
| `src/service/evaluator-review.save.integration.test.ts` | 19 | Save body schemas, decision outcomes, access control, authorship-keyed edit guard |
| `src/service/evaluator-review.standards.integration.test.ts` | 6 | Claimed-and-uploaded standard-file filtering, surface parity |
| `src/service/evaluator-review.verdict.integration.test.ts` | 17 | Finalize authorization, hard gate, promotion, outcomes, deferred deletion, atomicity |
| **Subtotal** | **52** | |

### 5.2 Adjacent suites exercising Evaluation behaviour

| File | Cases | Scope |
|---|---:|---|
| `src/service/answer.integration.test.ts` | 3 | Latest-log-wins verdict enrichment on the factory read |
| `src/service/score.integration.test.ts` | 16 | Cover readiness, regional/provincial/admin score queries, Grade gating |
| `src/service/score.test.ts` | 27 | Score arithmetic, category breakdown, `ScoreReportSchema` including Grade |
| **Subtotal** | **46** | |

**Total: 98 cases across 7 files.**

Five of these cases are uncommitted work in progress for bolt 024 (intent 011, finished-Cover Grade guard) and have **no recorded execution**: three Grade-contract cases in `score.test.ts`, one CoverLog-ordering case in `score.integration.test.ts`, and one admin null-Grade case in `evaluator-review.verdict.integration.test.ts`.

## 6. Execution Results

### 6.1 Static verification era — bolts 006–010 (2026-06-17)

No test runner existed at the time (`package.json test → exit 1`). Verification was code review against acceptance criteria plus `tsc --noEmit` and Biome.

| Bolt | Delivered | ACs verified | Result |
|---|---|---:|---|
| 006-evaluator-review | Schema foundation: `verdict_choice`, `recommended` status, `categoriesFor` | 4 / 5 | Pass, 1 pending (`db:push` never confirmed) |
| 007-evaluator-review | Answers list + batch verdict endpoint | 7 / 7 | Pass |
| 008-evaluator-review | ODPC finalize + file deletion on reject | 16 / 16 | Pass |
| 009-evaluator-review | Factory accept/redo negotiation + re-submit gate | 10 / 10 | Pass |
| 010-evaluator-review | Grade computation + verdict emails | 18 / 18 | Pass |
| **Total** | | **55 / 56** | 1 AC pending human action |

These results are asserted by reading code, not by executing it. Bolts 007 and 008 were later superseded: the batch verdict path they verified was removed in bolt 021.

### 6.2 Executable era — bolts 011–023

| Date | Bolt | Suites executed | Recorded result |
|---|---|---|---|
| 2026-06-19 | 011-admin-as-evaluator | `evaluator-review.integration` | 10 pass / 0 fail; full project suite 95 pass / 1 fail |
| 2026-06-19 | 012-admin-as-evaluator | `evaluator-review.verdict` | 6 pass / 0 fail; full project suite 101 pass / 1 fail |
| 2026-07-02 | 019-per-answer-verdict-save | `evaluator-review.save` | 19 pass / 0 fail, 34 expects, 441 ms |
| 2026-07-02 | 020-per-answer-verdict-save | `evaluator-review.finalize` | 15 pass / 0 fail, 61 expects, ~360 ms |
| 2026-07-02 | 021-per-answer-verdict-save | `integration` + `save` + `verdict` | 44 pass / 0 fail, 115 expects, ~590 ms |
| 2026-07-03 | 022-review-standard-files | All four core suites | 50 pass / 0 fail, 135 expects, ~510 ms |
| 2026-07-07 | 023-change-score-file-deletion | `verdict`; `save` + `standards`; `answer` | 16 / 16 (66 expects); 25 / 25 (51 expects); 3 / 3 (18 expects) |
| 2026-07-15 | Documentation audit | Isolated files only, integration not run | `score.test.ts` 24 pass / 0 fail, 48 expects, 26 ms |

**Last full-module green baseline: 50 / 50 on 2026-07-03 (bolt 022), extended to 51 by bolt 023 on 2026-07-07.** The single project-suite failure recorded in bolts 011 and 012 was a pre-existing `score.integration.test.ts` fixture defect (`scoring.total.maxScore` NaN), outside those bolts' scope; it was still listed as out of scope in every later report and its current state has not been re-verified.

### 6.3 Route-wiring verification — bolt 021 (2026-07-02)

Six unauthenticated HTTP probes against the live application on port 3000:

| Probe | Expected | Result |
|---|---|---|
| `POST /evaluators/covers/1/answers/1/verdict` | 401 (guard) | Pass — route registered |
| `POST /admins/covers/1/answers/1/verdict` | 401 (guard) | Pass — route registered |
| `POST /evaluators/covers/1/finalize` (empty body) | 401, not a body-validation 400 | Pass |
| `POST /admins/covers/1/finalize` | 401 | Pass |
| `POST /evaluators/covers/1/verdict` (removed batch) | 404 | Pass |
| `POST /admins/covers/1/verdict` (removed batch) | 404 | Pass |

Guards run before body validation, so an unauthenticated empty-body finalize returns 401 rather than 400.

### 6.4 Static quality gates

| Gate | Last observation | Result |
|---|---|---|
| `tsc --noEmit` on Evaluation files | 2026-07-07 (bolt 023) | Clean; remaining project errors confined to unrelated in-flight files |
| `tsc --noEmit` project-wide | 2026-07-15 (docs audit) | **Not reproducible** — no local `tsc`, `bunx tsc` fails with a Bun tempdir permission error |
| Biome on Evaluation files | 2026-07-07 (bolt 023) | Clean apart from the shared `Bun.env.DATABASE_URL!` non-null warning in tests |
| Biome repository-wide | 2026-07-15 (docs audit) | **Red** — 77 files checked, 8 errors, 30 warnings, 3 infos |

## 7. Requirements Traceability

Each row maps a functional requirement to the assertions that cover it.

| Requirement | Covering cases | Level |
|---|---|---|
| Reviewer level determines category scope (Mental / DOH / ODPC) | `integration` — category-filter case; `save` — out-of-scope 403 | Integration |
| Cover access is region-gated for evaluators, existence-only for admins | `integration` — wrong-region 404, region-null 404; `verdict` — wrong-region finalize 404 | Integration |
| **FR-5: no save path writes `finished`** | `save` — ODPC approve → `recommended`; `verdict` — save path never writes `finished` | Integration |
| `change_score` requires `verdictChoice` 0–3 and a description; `reject` requires a description | `save` — five schema cases | Schema/unit |
| A no-op `change_score` equal to the live choice is rejected | `save` — 400 case | Integration |
| `finished` is immutable to everyone including ODPC | `save` — 400 immutability case | Integration |
| A non-ODPC author may re-edit only its own `recommended` | `save` — own-edit 200, other-author 403, ODPC override 200 | Integration |
| Finalize is ODPC-only | `verdict` — Mental 403, DOH 403 | Integration |
| Finalize is blocked while any Answer is `in_review` | `verdict` — 400 with no side effects | Integration |
| Un-overridden `recommended` is promoted to `finished`, authored by the finalizer | `verdict` — promotion case, already-finished no-duplicate case | Integration |
| All finished → one `coverLogs` `finished` + Grade + one `verdict-result-finished` email | `verdict` — outcome case, email case | Integration |
| ≥1 rejected → one `coverLogs` `in_progress`, null Grade, one `verdict-result-in-progress` email | `verdict` — outcome case, email case, admin null-Grade case | Integration |
| Files of Answers rejected at finalize are deleted; recommended files preserved | `verdict` — deletion case, change-score-then-approve case | Integration |
| A MinIO delete failure aborts finalize before the transaction, with no partial transition | `verdict` — edge-case 500 | Integration |
| Promotions and the Cover transition commit atomically | `verdict` — atomicity case | Integration |
| Admin surface produces outcomes identical to evaluator-ODPC | `integration` — admin read; `verdict` — admin finalize | Integration |
| Only claimed **and** uploaded standards are returned, at factory level | `standards` — six cases | Integration |
| Grade thresholds (gold / silver / certificate / joined) | `score.test.ts` — formula and schema cases | Unit |
| Grade is null unless the Cover is `finished` | `score.integration` — intent-011 case (uncommitted); `verdict` — admin null-Grade case (uncommitted) | Integration |
| Factory negotiation (accept / redo) and the re-submit gate | Bolt 009 static review only | **Static only** |
| Route guards reject non-DOED (403) and anonymous (401) callers | None — see D-01 | **Uncovered** |

## 8. Defects and Open Issues

| ID | Severity | Description | Source | Status |
|---|---|---|---|---|
| D-01 | High | `adminGuard` 403 / 401 paths on `/admins/covers/*` are not covered. `requireRoles`' `as:"local"` early return does not propagate in an isolated mount, so the AC was flagged rather than asserted. Both bolts recommended an e2e smoke with a real cookie; it has not been added. | Bolts 011, 012 | Open |
| D-02 | Medium | No re-finalize guard. Finalizing an already-`finished` Cover writes a duplicate `coverLogs` row and enqueues a duplicate factory email. Deliberately preserved as parity with the old batch model. | Bolt 020 | Open by decision |
| D-03 | Medium | `score.integration.test.ts` recorded one failing case (`scoring.total.maxScore` NaN fixture) on 2026-06-19 and was declared out of scope by every later bolt. The file has uncommitted edits; the current state has **not** been re-verified. | Bolts 011, 012 | Unverified |
| D-04 | Medium | Bolt 006's AC 4 — `bun run db:push` applying `verdict_choice` and the `recommended` enum value — was never confirmed in any later report. | Bolt 006 | Open |
| D-05 | High | Integration suites mutate the database named by `DATABASE_URL`, whose fallback is the ordinary development database `twhp`. There is no `TEST_DATABASE_URL`, database-name guard, per-run schema, or rollback harness, and fixture cleanup is only partially hermetic. | `docs/testing.md` | Open |
| D-06 | Medium | No coverage measurement exists for this or any module. Completeness is asserted only by AC-to-test mapping. | All bolts | Open |
| D-07 | Medium | Bolt 024 (finished-Cover Grade guard) has a domain model and technical design but **no test report**. Its five test cases are uncommitted and have no recorded execution. | `memory-bank/bolts/024-*` | In progress |
| D-08 | Medium | Route-level correctness rests on boot, OpenAPI presence, and unauthenticated probes. No authenticated HTTP test asserts guards, path-parameter validation, or response mapping end to end. | Bolt 021 | Open |
| D-09 | Low | Deletion semantics are asymmetric: finalize uses the non-swallowing `deleteFileStrict`, while `answer.ts` and `enroll.ts` retain best-effort `deleteFile`, which logs and continues on MinIO failure. Only the finalize path has a failure test. | Bolt 020 | Open by decision |
| D-10 | Low | Repository-wide Biome is red (8 errors, 30 warnings, 3 infos as of 2026-07-15) and project-wide type-checking is not reproducible from installed dependencies. Neither is an enforced gate. | `docs/testing.md` | Open |

No defect in the Evaluation module's own logic was open at the last recorded execution. Bolts 019–023 each reported zero issues found.

## 9. Coverage Assessment

**Well covered.** The two-phase write path is the most thoroughly tested area of the codebase: decision outcomes, the FR-5 invariant, the authorship-keyed edit guard, category and region scoping, the finalize hard gate, promotion authorship, both Cover outcomes, email selection and payload, deferred file deletion including the MinIO-failure abort, and transaction atomicity — asserted on both the evaluator and admin surfaces.

**Partially covered.** Grade computation is covered arithmetically and at the schema level, but its integration with finalize is asserted only as membership in the Grade enum, not against a fixed expected Grade per fixture. Route wiring is covered by registration and guard-attachment probes only.

**Not covered.** RBAC rejection paths (D-01); factory negotiation and the re-submit gate, which remain static-review-only from bolt 009; concurrency, including two simultaneous finalizers and double-submit; idempotency and re-finalize (D-02); real MinIO, Redis, BullMQ processing, and SMTP behaviour, all of which are stubbed; and fiscal-year boundary behaviour on the Cover queries this module reads.

## 10. Conclusion and Recommendations

**Conclusion.** The Evaluation module's business logic is in a verified-passing state as of its last recorded execution: **51 of 51 core cases passing on 2026-07-07**, with zero open defects in module logic and complete AC-to-test traceability for bolts 019–023. Confidence in the module's write path is high. Confidence in its authorization boundary, concurrency behaviour, and external-service integration is low, and none of the figures in this report have been re-verified on 2026-08-17.

**Recommendations, in priority order**

1. Provision a disposable, migrated, seeded test database with an explicit `TEST_DATABASE_URL` and a fail-closed database-name guard, then re-run the four core suites to re-baseline this report (D-05).
2. Add an authenticated end-to-end smoke asserting 403 for a non-DOED token and 401 anonymous on both admin routes, closing the AC flagged in bolts 011 and 012 (D-01).
3. Complete bolt 024: run its five cases, resolve the `score.integration.test.ts` fixture question, and write its test report (D-03, D-07).
4. Decide the re-finalize question explicitly — either add an idempotency guard or record the current behaviour in an ADR addendum (D-02).
5. Add executable coverage for factory negotiation and the re-submit gate, currently the largest static-only surface in the evaluation flow.
6. Restore reproducible type-checking and a read-only lint gate before treating either as CI-enforceable (D-10).

## 11. Verification Commands

Do **not** run these until `DATABASE_URL` names a disposable, migrated, seeded database.

```bash
# Core Evaluation suites
bun test src/service/evaluator-review.integration.test.ts
bun test src/service/evaluator-review.save.integration.test.ts
bun test src/service/evaluator-review.standards.integration.test.ts
bun test src/service/evaluator-review.verdict.integration.test.ts

# Adjacent suites
bun test src/service/answer.integration.test.ts
bun test src/service/score.integration.test.ts

# Safe to run without a database
bun test src/service/score.test.ts

# Read-only lint
bun ./node_modules/.bin/biome check src
```

Related documents: [Testing](./testing.md), [Technical debt](./technical-debt.md), [Business rules](./business-rules.md), [Database](./database.md), [Thai version of this report](./test-report-th.md).
