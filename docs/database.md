# Database and persistence

This guide documents the persistence model implemented by the current source and configuration, verified on 2026-08-25 and re-checked on 2026-09-02. Where older requirements or prose disagree with the code, current code/schema is described as behavior and the disagreement is recorded under [Documentation conflicts](#documentation-conflicts).

Related guides:

- [Domain model](./domain-model.md) — business entities and workflow vocabulary
- [Business rules](./business-rules.md) — application-level invariants and transitions
- [Deployment](./deployment.md) — containers, environments, and production operations
- [Technical debt](./technical-debt.md) — prioritized remediation across the system

## Evidence status

- **Verified**: directly present in current source/config/data or confirmed by a local non-mutating command.
- **Inferred**: follows from PostgreSQL/Drizzle behavior or an observed query pattern, but was not checked against a running database.
- **Unknown**: cannot be established from the repository alone.

This is not a live-database inventory. `DATABASE_URL` was absent from the audit shell, so live catalog state, row counts, query plans, server timezone, extensions, grants, backups, and production drift are **Unknown**.

## Persistence overview

**Verified.** PostgreSQL is the relational source of truth. Redis holds transient OTP/password-reset data and BullMQ state; MinIO holds evidence objects. PostgreSQL stores only MinIO UUID filenames. The application uses `drizzle-orm/node-postgres` through `db` in `src/drizzle/index.ts:1-4` and a single schema file, `src/drizzle/schema.ts`. TypeBox select/insert/update schemas are derived from the Drizzle tables in `src/schema/index.ts:1-87`.

The schema contains 12 tables and 7 PostgreSQL enums. Scores and grades are calculated on demand and are not persisted (`docs/adr/0001-score-calculated-on-demand.md:9-22`, `src/service/score.ts:createScoreService`). Current Cover and Answer state is derived by “latest log wins,” ordered by descending serial `id`, not timestamp (`src/service/cover.ts:72-78`, `src/service/evaluator-review.ts:193-204`, `src/service/answer.ts:323-331`).

```mermaid
erDiagram
    Accounts ||--o| Factories : "account_id; CASCADE"
    Accounts ||--o| Evaluators : "account_id; CASCADE"
    Accounts ||--o| AdminsDoed : "account_id; CASCADE"
    Accounts ||--o| ProvincialOfficers : "account_id; RESTRICT"

    Provinces ||--o{ Districts : "province_id; RESTRICT"
    Districts ||--o{ Subdistricts : "district_id; RESTRICT"
    Provinces ||--o{ Factories : "province_id; RESTRICT"
    Districts ||--o{ Factories : "district_id; RESTRICT"
    Subdistricts ||--o{ Factories : "subdistrict_id; RESTRICT"
    Provinces ||--o{ ProvincialOfficers : "province_id; RESTRICT"

    Factories ||--o{ Enrolls : "factory_id; RESTRICT"
    Evaluators ||--o{ Enrolls : "eval_doh_id; RESTRICT"
    Evaluators ||--o{ Enrolls : "eval_odpc_id; RESTRICT"
    Evaluators ||--o{ Enrolls : "eval_mental_id; RESTRICT"
    Enrolls ||--o{ Covers : "enroll_id; CASCADE"
    Covers ||--o{ CoverLogs : "cover_id; NO ACTION"
    Covers ||--o{ Answers : "cover_id; NO ACTION"
    Questions ||--o{ Answers : "question_id; NO ACTION"
    Answers ||--o{ AnswerLogs : "answer_id; RESTRICT"

    Accounts {
      serial id PK
      text username UK
      text email UK
      text password
      Roles role
      text hashed_refresh_token NULL
    }
    Factories {
      int account_id PK_FK
      int province_id FK
      int district_id FK
      int subdistrict_id FK
      boolean is_validate
    }
    Enrolls {
      serial id PK
      timestamp enroll_date
      int factory_id FK
      int eval_doh_id FK
      int eval_odpc_id FK
      int eval_mental_id FK
      boolean standard_flags
      text standard_file_names NULL
    }
    Covers {
      serial id PK
      int enroll_id FK
      timestamp enroll_date
    }
    CoverLogs {
      serial id PK
      int cover_id FK
      coverStatus status
      timestamp updated_at
      int evaluator_id NULL
    }
    Questions {
      int id PK
      QuestionCategories category
      StandardTypes_array standard
      int special
    }
    Answers {
      serial id PK
      int question_id FK
      int cover_id FK
      Choices selected_choice
      text evidence_file_names NULL
    }
    AnswerLogs {
      serial id PK
      int answer_id FK
      answerStatus status
      Choices verdict_choice NULL
      text description NULL
      timestamp updated_at
      int evaluation_id NULL
    }
```

The diagram shows physical FK cardinality, not intended business cardinality. The database currently permits many Covers per Enroll and duplicate Answers per `(cover_id, question_id)`. The application expects narrower cardinalities; see [Intended or assumed application invariants](#intended-or-assumed-application-invariants).

## PostgreSQL enums

All are **Verified** in `src/drizzle/schema.ts`.

| Symbol / database type | Values | Evidence |
|---|---|---|
| `evaluatorLevels` / `EvaluatorLevels` | `Mental`, `DOH`, `ODPC` | line 13 |
| `roles` / `Roles` | `Factory`, `Provincial`, `Evaluator`, `DOED` | line 14 |
| `coverStatus` / `coverStatus` | `finished`, `in_progress`, `in_review` | line 296 |
| `answerStatus` / `answerStatus` | `finished`, `in_review`, `recommended`, `rejected` | lines 297-302 |
| `questionCategories` / `QuestionCategories` | `Collaborate`, `Disease`, `Safety`, `Mental`, `Outcome` | lines 316-322 |
| `standardTypes` / `StandardTypes` | `standardHC`, `standardSAN`, `standardSANPlus`, `standardWellness`, `standardSafety`, `standardTIS18001`, `standardISO45001`, `standardISO14001`, `standardZero`, `standard5S`, `standardHAS` | lines 324-337 |
| `choices` / `Choices` | `0`, `1`, `2`, `3`, `n/a` | line 351 |

Several database type names are quoted/mixed-case, so raw SQL must quote them exactly. `AnswerLogs.verdict_choice` physically permits `n/a` because it uses `Choices`; the verdict API restricts score changes to `0`-`3` (`src/schema/evaluator-review.ts:77-85`). That narrower rule is application-only.

## Model catalog

Unless stated otherwise, columns are `NOT NULL`; columns marked `NULL` have no default. PostgreSQL automatically indexes each primary-key and unique constraint. No Drizzle `relations()` declarations exist; services use FKs and explicit joins.

### Accounts

`Accounts` is defined at `src/drizzle/schema.ts:234-252`.

- `id serial` — PK, sequence default.
- `username text` — unique index `Accounts_username_key`.
- `password text` — bcrypt hash in application paths.
- `email text` — unique index `Accounts_email_key`.
- `role Roles`.
- `hashed_refresh_token text NULL`.
- `Accounts_id_key` is an explicit unique index on the PK and is likely redundant with the PK index.

`Accounts.role` is not linked to subtype membership. The database permits a role/subtype mismatch, no subtype, or multiple subtypes; authentication services assume the matching subtype (`src/service/authentication.ts:getAccountById`, `getAutheticatedAccount`).

### Factories

`Factories` is defined at `src/drizzle/schema.ts:87-124`.

- `account_id int` — PK and FK to `Accounts.id`; update/delete cascade.
- Required: `factory_type`, Thai/English names, TSIC code, address number, zipcode, phone.
- Nullable: `soi`, `road`, `fax_number`.
- `province_id`, `district_id`, `subdistrict_id` — independent FKs; update cascade, delete restrict.
- `is_validate boolean DEFAULT false`.

The three independent location FKs do not guarantee that the subdistrict belongs to the district or that the district belongs to the province. Registration/update derives them together in `src/service/factory.ts:createFactoryHelper.getFactoryLocation` and `update`, but direct writes can create impossible combinations.

### Evaluators

`Evaluators` is defined at `src/drizzle/schema.ts:16-30`.

- `account_id int` — PK and FK to `Accounts.id`; update/delete cascade.
- `level EvaluatorLevels`, `first_name`, `last_name`, `region int`, `phone_number`.
- `isChangePassword boolean DEFAULT false`.

No unique constraint ensures one Evaluator per `(region, level)`.

### AdminsDoed

`AdminsDoed` is defined at `src/drizzle/schema.ts:126-146`.

- `account_id int` — PK and FK to `Accounts.id`; update/delete cascade.
- `first_name`, `last_name`, `phone_number`.
- `AdminsDoed_account_id_key` duplicates the PK uniqueness.

### ProvincialOfficers

`ProvincialOfficers` is defined at `src/drizzle/schema.ts:254-281`.

- `account_id int` — PK and FK to `Accounts.id`; update cascade, delete restrict.
- `first_name`, `last_name`, `phone_number`.
- `province_id` — FK to `Provinces.province_id`; update cascade, delete restrict.
- `isChangePassword boolean DEFAULT false`.
- `ProvincialOfficers_account_id_key` duplicates the PK uniqueness.

### Provinces

`Provinces` is defined at `src/drizzle/schema.ts:32-45`.

- `province_id int` — PK.
- `name_th text`, `health_region int`.
- `Provinces_province_id_key` duplicates the PK uniqueness.

### Districts

`Districts` is defined at `src/drizzle/schema.ts:47-65`.

- `district_id int` — PK.
- `province_id` — FK to `Provinces`; update cascade, delete restrict.
- `name_th text`.
- `Districts_district_id_key` duplicates the PK uniqueness.

### Subdistricts

`Subdistricts` is defined at `src/drizzle/schema.ts:67-85`.

- `subdistrict_id int` — PK.
- `district_id` — FK to `Districts`; update cascade, delete restrict.
- `name_th text`.
- `Subdistricts_subdistrict_id_key` duplicates the PK uniqueness.

### Enrolls

`Enrolls` is defined at `src/drizzle/schema.ts:148-232`.

- `id serial` — PK.
- `enroll_date timestamp(3) DEFAULT CURRENT_TIMESTAMP`.
- `factory_id` — FK to `Factories.account_id`; update cascade, delete restrict.
- `eval_doh_id`, `eval_odpc_id`, `eval_mental_id` — FKs to `Evaluators.account_id`; update cascade, delete restrict.
- Twenty required employee-count integers: ten nationalities/categories for male and female employees.
- Eleven required standard booleans and eleven nullable standard filename columns.
- Required safety-officer prefix, first name, last name, and position.
- Nullable safety-officer email, phone, and Line ID.
- `enrolls_id_key` duplicates the PK uniqueness.

There is no uniqueness on Factory/date and no constraint proving evaluator level or region matches the assignment.

### Covers

`Covers` is defined at `src/drizzle/schema.ts:283-294`.

- `id serial` — PK.
- `enroll_id` — FK to `Enrolls.id`; update/delete cascade.
- TypeScript field `startDate` maps to physical column `enroll_date`, `timestamp(3) DEFAULT CURRENT_TIMESTAMP`.

There is no unique constraint on `enroll_id`.

### CoverLogs

`CoverLogs` is defined at `src/drizzle/schema.ts:304-314`.

- `id serial` — PK and event ordering key.
- `cover_id` — FK to `Covers.id`; delete `NO ACTION`, update action unspecified/`NO ACTION`.
- `status coverStatus`.
- `updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP`.
- `evaluator_id int NULL` — deliberately no FK so Evaluator and DOED actor IDs can share the column, but nonexistent/deleted IDs are also possible.

### Questions

`Questions` is defined at `src/drizzle/schema.ts:339-349`.

- `id int` — manually assigned PK.
- `category QuestionCategories`, `question_text`.
- `standard StandardTypes[]` — required, may be empty.
- Choice text for `1`, `2`, `3`; nullable `choice_na`.
- `special int`.

No checks constrain `special` or the relationship between `choice_na` and permitted Answer values.

### Answers

`Answers` is defined at `src/drizzle/schema.ts:353-371`.

- `id serial` — PK.
- `question_id` — FK to `Questions.id`; delete `NO ACTION`.
- `cover_id` — FK to `Covers.id`; delete `NO ACTION`.
- Nine nullable evidence filename columns.
- `selectedChoice Choices`.

There is no unique constraint on `(cover_id, question_id)`.

### AnswerLogs

`AnswerLogs` is defined at `src/drizzle/schema.ts:373-385`.

- `id serial` — PK and event ordering key.
- `answer_id` — FK to `Answers.id`; delete restrict.
- `status answerStatus`.
- Nullable `verdict_choice Choices`, `description`, and `evaluation_id int`.
- `updated_at timestamp(3) DEFAULT CURRENT_TIMESTAMP`.

`evaluation_id` has no FK. Status/verdict/description combinations are not checked by the database.

## Schema lifecycle and connection

### Development and staging

**Verified.** `package.json:12-13` defines:

```bash
bun run db:push   # bunx drizzle-kit push
bun run db:seed   # bun src/drizzle/seed.ts
```

The audited local versions were Bun `1.3.6`, drizzle-kit `0.31.10`, and drizzle-orm `0.45.1`. `drizzle.config.ts:4-10` points at `src/drizzle/schema.ts`, PostgreSQL dialect, output `src/core/drizzle/generated`, and `process.env.DATABASE_URL`. No generated directory or SQL migrations were found.

`docker-compose.yaml:1-19` runs `db:push && db:seed` in the dev/staging `migrate-dev` one-shot before API startup. PostgreSQL is `postgres:17-alpine`, persisted in `postgres_data`, exposed on host port 5433 (`docker-compose.yaml:143-162`).

`db:push` converges state rather than preserving an auditable migration history. Reviewable ordered DDL, rollback, and repeatable production promotion are absent.

### Production

**Verified repository behavior.** `migrate-prod` only echoes `do not migrate in production, import csv directly`; it performs no migration or import (`docker-compose.yaml:58-71`). No production import script, schema dump, migration files, or runbook was found.

**Unknown / Requires Organizational Knowledge.** The actual production schema/import process, approval gate, backup/rollback procedure, and drift verification are unknown. See [Deployment](./deployment.md) for other operational unknowns. Do not infer that production is provisioned by Compose.

### Connection configuration

Runtime `db` uses `drizzle(env.DATABASE_URL)` with node-postgres (`src/drizzle/index.ts:1-4`). Seeding separately creates a `pg.Pool`, passes the schema to Drizzle, and closes the pool (`src/drizzle/seed.ts:14-22,287-294`). Pool size, timeouts, SSL, application name, and transaction isolation are not explicitly configured; exact behavior depends on defaults and `DATABASE_URL`.

**Tooling full-environment coupling.** `drizzle.config.ts:2` imports `env` but uses `process.env.DATABASE_URL` directly. Importing `env` eagerly validates every required API, Redis, SMTP, frontend, and MinIO variable (`src/config.ts:41-89`). Therefore `db:push` can fail because an unrelated non-database variable is absent. This is current behavior, not a documented requirement.

### Live-environment unknowns

The repository does not establish:

- live schema drift, actual indexes, sequences, or row counts;
- server/session timezone and isolation defaults;
- SSL mode, roles/grants, RLS, or extensions;
- backups/PITR, monitoring, maintenance, or production data retention;
- whether `.env` and `docker.env` agree.

Environment values were intentionally not reproduced during the audit.

## Seed data

**Verified.** `src/drizzle/seed.ts:24-282` seeds in FK order: Provinces, Districts, Subdistricts (batches of 1,000), Provincial accounts/profiles, Evaluator accounts/profiles, one fixed DOED admin, and Questions. Most writes upsert by PK/username. There is no global transaction, so failure can leave partial refresh state.

| Dataset | Static validation |
|---|---|
| `provinces.csv` | 77 rows; unique IDs |
| `districts.csv` | 929 rows; unique IDs; all province references present |
| `sub_districts.csv` | 7,451 rows; unique IDs; all district references present |
| `admin_province.json` | 77 entries; usernames, emails, province IDs unique |
| `eval.json` | 39 entries; exactly Mental/DOH/ODPC for each region 1-13; usernames/emails unique |
| `questions.json` | 41 unique IDs; all five categories and all 11 standard values; 32 `None` standards normalize to empty arrays; `special` 0/1/2/3 distribution is 30/3/5/3 |

Seed risks:

- Reruns re-hash and overwrite every seeded staff password (`src/drizzle/seed.ts:110-130,158-179`).
- A fixed development admin credential is embedded in source (`:205-244`); seeding deletes another account that owns its email before upsert. This is unsuitable for production.
- Username is the upsert target while email is independently unique, so cross-swapped values can conflict.
- Provincial/Evaluator account and subtype writes are not one transaction.
- Removing a record from a seed file does not remove the existing database row; seeding is not an exact mirror.

## Transactions and MinIO consistency

Verified atomic database units include:

- Account + Factory registration (`src/service/factory.ts:register`, lines 59-82).
- Admin profile + Account update (`src/service/admin.ts:editAdminData`, lines 26-47).
- Cover + initial CoverLog (`src/service/cover.ts:create`, lines 40-44).
- Answer insert/update + AnswerLog append (`src/service/answer.ts:saveAnswer`, `update`, `negotiate`).
- First-password Account/profile updates (`src/service/authentication.ts:editFirstPassword`).
- Finalize promotions, file-column clearing, and CoverLog append (`src/service/evaluator-review.ts:finalize`, lines 458-481).

PostgreSQL and MinIO cannot be one transaction:

- Enrollment creation uploads up to 11 objects before the database insert and has no cleanup if insertion fails (`src/service/enroll.ts:create:288-335`).
- Enrollment/Answer updates delete old objects and upload replacements before the database update. A database failure can leave missing referenced objects or orphan new objects (`src/service/enroll.ts:updateEnroll:459-536`, `src/service/answer.ts:update:556-670`, `negotiate:923-1035`).
- Finalize strictly deletes objects before its database transaction. A deletion failure stops the transition, but a later database failure leaves files gone while old filenames/state remain (`src/service/evaluator-review.ts:443-481`).

No outbox, compensating cleanup, reconciliation job, object versioning, request idempotency key, row lock, serializable transaction, or optimistic version was found.

## Dates, fiscal years, and timezone

### Current behavior

All persisted timestamps use PostgreSQL `timestamp(3)` **without time zone**, Drizzle string mode, and `CURRENT_TIMESTAMP`: `Enrolls.enroll_date`, `Covers.enroll_date`, `CoverLogs.updated_at`, and `AnswerLogs.updated_at` (`src/drizzle/schema.ts:152-154,291-293,310-312,381-383`). Latest state is ordered by log `id`, avoiding timestamp-tie ambiguity.

`utilities().getFiscalYear()` constructs local JavaScript dates for October 1 00:00 through the next October 1 00:00, then callers compare ISO UTC strings against the timezone-less column (`src/utils.ts:53-61`). API/worker Compose services set `TZ=Asia/Bangkok`, but the PostgreSQL container and `migrate-dev` do not explicitly set it (`docker-compose.yaml:28-30,78-80,111-113,130-132,143-162`).

### Uncertainty and risk

Server/session timezone was not observed. Comparing timezone-aware ISO strings with `timestamp without time zone` can shift fiscal-boundary membership when application, local shell, migration process, and PostgreSQL session timezone differ. `CURRENT_TIMESTAMP` stored into a timezone-less column also uses database session interpretation.

This is **Inferred risk** with **Unknown live configuration**, not proof that current production rows are wrong. Establish one canonical timezone, verify session settings, test Sep-30/Oct-1 Bangkok boundaries, and consider `timestamptz` for instants. If fiscal membership must be unique, use an enforceable fiscal-year key or equivalent database design rather than only a time-range pre-check.

## Query patterns and indexes

### Observed access patterns

- Current-fiscal owner lookup filters `Enrolls(factory_id, enroll_date range)` and joins `Covers(enroll_id)` throughout `answer.ts`, `cover.ts`, and `score.ts`.
- Staff lists filter/sort `Enrolls.enroll_date` and join Factory/Province (`enroll.ts:77-154`, `score.ts:159-237`).
- Location endpoints filter `Districts.province_id` and `Subdistricts.district_id` (`location.ts:17-34`).
- Factory lists filter `Factories.is_validate`, province/region, and join Enrolls (`factory.ts:124-256`, `admin.ts:99-121`).
- Latest-state reads filter and order by `(cover_id, id DESC)` or `(answer_id, id DESC)`.
- Answer reads filter by `cover_id`, frequently `(cover_id, question_id)`.
- Refresh-token lookup filters `Accounts.hashed_refresh_token` (`authentication.ts:117-129`).

### Declared indexes

**Verified.** Only PK indexes, unique Account username/email indexes, and several redundant explicit PK unique indexes are declared. No secondary indexes exist in the Drizzle schema for FK, latest-log, status, or date query columns (`src/drizzle/schema.ts`, `uniqueIndex` at lines 40,60,80,141,230,245-250,276).

Candidate indexes, to validate against live `EXPLAIN (ANALYZE, BUFFERS)`:

1. `UNIQUE Answers(cover_id, question_id)` for correctness and dominant lookup.
2. `UNIQUE Covers(enroll_id)` if one Cover per Enroll is confirmed.
3. `Enrolls(factory_id, enroll_date DESC)` for current-fiscal owner lookup; extend/replace it with a fiscal-year uniqueness design if required.
4. `CoverLogs(cover_id, id DESC)` and `AnswerLogs(answer_id, id DESC)` for latest-log queries.
5. `Districts(province_id)`, `Subdistricts(district_id)`, `Factories(province_id)`, and `ProvincialOfficers(province_id)` for joins/FK checks.
6. `Evaluators(region, level)`; make unique only if exactly one per pair is a durable rule.
7. A partial `Accounts(hashed_refresh_token)` index excluding null/empty values, after token semantics are confirmed.
8. Plan-dependent indexes on `Enrolls(enroll_date DESC)`, `Provinces(health_region)`, or Factory validation filters.

Inspect the live catalog before removing explicit PK unique indexes; they are **Inferred** redundant, not live-verified.

### Repeated statement risks

Read paths in `enroll.ts:enrichAndFilterCovers`, `score.ts:buildScoreReports`, evaluator Answer listing, and Factory Answer listing are batched; no classic per-row read N+1 was found.

- `answer.ts:submit:290-303` inserts each unanswered standard Answer and log sequentially: 2N statements.
- `evaluator-review.ts:finalize:458-461` inserts promotion logs sequentially: N statements.
- `factory.ts:getAllFactories` can duplicate Factory rows when multiple Enrolls match, especially when its left join is not date-bounded.

## Intended or assumed application invariants

The following are not database guarantees. Some are checked on particular service paths; others are only expectations in documentation/query code and are not enforced consistently. Treat each item as an audit prompt, not a promise that every write path validates it:

- One Enroll per Factory per fiscal year (`src/service/enroll.ts:create:227-245`). This is a check-then-insert race with no unique constraint.
- One Cover per Enroll (`src/service/cover.ts:create:29-44`). Also check-then-insert.
- One Answer per Cover/Question (`src/service/answer.ts:saveAnswer:42-49`). Also check-then-insert.
- Exactly one Evaluator of each level per region. Seed data satisfies this, but `enroll.ts:create:259-332` selects the first match and dereferences each level without verifying all exist.
- Enroll evaluator assignments match the intended region and level.
- Account role matches exactly one subtype.
- Factory location hierarchy is internally consistent.
- Employee counts are intended to be nonnegative, but current DTOs do not set a minimum; region, factory type, and Question `special` ranges likewise rely partly on seed/input discipline.
- Claimed standards are intended to have filenames and unclaimed standards not to, but update paths can persist a filename for a false standard.
- Answer evidence matches selected choice and Question-specific requirements.
- AnswerLog status/verdict/description combinations and CoverLog transitions are intended to be legal, but there is no general transition validator or database check.
- `evaluation_id`/`evaluator_id` is intended to identify a real actor, but no foreign key enforces it.
- Product prose suggests Question-specific `n/a`, but current DTO/service code accepts `n/a` for every Question.

Concurrent enrollment, Cover creation, Answer save, verdict save, submit, or finalize can pass stale checks and append conflicting rows. Default transaction isolation does not protect multi-request check-then-write sequences.

### Finalize is not locked or idempotent

`src/service/evaluator-review.ts:finalize:329-481` checks caller level/access and latest AnswerLogs, but it does not:

- read/gate on latest CoverLog status;
- lock the Cover or Answers;
- use a request idempotency key or optimistic version;
- reject an already-finished Cover.

Two finalizers can read the same state, append duplicate promotion AnswerLogs, and append multiple CoverLogs. A later repeated finalize can append another Cover transition. “Only finalize writes the transition” describes which code path writes; it does not provide mutual exclusion.

## DTO/schema alignment

Verified strengths:

- Base DTOs derive from Drizzle tables (`src/schema/index.ts`).
- `StandardKeySchema` has a compile-time two-way equality guard against `standardTypes` (`src/schema/evaluator-review.ts:31-53`).
- Multipart DTOs convert uploaded files into persisted filenames rather than accepting public URLs.

Verified weak spots:

- Create Enroll accepts an unrestricted optional safety-officer email, while update requires email format (`src/schema/enroll.ts:60,116`); the database stores nullable text.
- Employee fields use `t.Numeric()` without nonnegative constraints (`src/schema/enroll.ts:24-44,80-100`).
- Evaluator Answer view and Score cover status use broad strings rather than enum unions (`src/schema/evaluator-review.ts:5-24`, `src/schema/score.ts:17-23`).
- `AnswerLogs.verdict_choice` physically accepts `n/a`; verdict DTOs do not.
- Generated JSON schemas and separate multipart schemas can drift (`src/schema/answer.ts:7`, `src/schema/enroll.ts:15-22`).
- The Factory Answers route omits `"cover_id"` from a generated schema whose TypeScript property is `coverId`; the apparent omit is ineffective (`src/routes/factories/assessments/index.ts:84-101`).
- `Covers.startDate` maps to physical column `enroll_date` (`src/drizzle/schema.ts:291`).

## Documentation conflicts

Current source/schema above is authoritative behavior. These older statements are recorded as conflicts, not truths.

### Finalize concurrency

`CONTEXT.md:131,213` and ADR-0005 (`docs/adr/0005-per-answer-verdict-save.md:14,43,51`) claim a single-finalizer/no-cover-race model. `memory-bank/intents/004-admin-as-evaluator/requirements.md:198` admits admin/ODPC concurrency but claims the second call hits an already-finalized guard. The current `finalize` implementation has no such guard, lock, or idempotency. **Confidence: High. Decision required:** accept/document duplicate finalization semantics or implement explicit concurrency control.

### Cardinality guarantees

`CONTEXT.md:33` and `memory-bank/intents/009-review-standard-files/requirements.md:119` describe one-assessment cardinalities as guaranteed. The schema has no uniqueness for one Enroll/fiscal year, `Covers.enroll_id`, or `(Answers.cover_id, Answers.question_id)`. **Confidence: High. Decision required:** confirm durable cardinalities and model them in PostgreSQL.

### Verdict Cover-state guard

`CONTEXT.md:110,122` says tier-1 reviewers edit their own verdicts only while the Cover is `in_review`. `saveAnswerVerdict` checks Answer status/authorship/category but not Cover status (`src/service/evaluator-review.ts:239-318`). **Confidence: High. Decision required:** decide whether Cover status is authorization and align code/docs.

### File deletion on change-score

`CONTEXT.md:125` and ADR-0005 line 28 describe deletion only for hard rejects. Current code deletes evidence for every latest `rejected` Answer, including change-score, following newer ADR-0006 (`src/service/evaluator-review.ts:417-448`, `docs/adr/0006-delete-files-on-change-score.md`). **Confidence: High.** Older prose is stale.

### Verdict email column

`CONTEXT.md:129` names `enrolls.email`; current schema/service use `Enrolls.safety_officer_email` / `enrolls.safetyOfficerEmail` (`src/drizzle/schema.ts:225`, `src/service/evaluator-review.ts:341-351`). **Confidence: High.** The documentation name is stale.

### Historical batch requirements

Intent 003 and portions of intent 004 specify atomic batch verdicts. ADR-0005 explicitly supersedes that mechanism (`docs/adr/0005-per-answer-verdict-save.md:3-5`); current routes implement per-Answer save plus separate finalize. Historical memory-bank requirements are not current behavior.

### Production migration/import

AGENTS/CLAUDE say production data is imported directly, but Compose only echoes and the repository contains no production procedure. Repository absence is **Verified**; actual operations are **Unknown / Requires Organizational Knowledge**.

### Drizzle full-env coupling

`drizzle.config.ts` imports the eager application env validator while reading `DATABASE_URL` directly. Database tooling therefore requires unrelated application configuration. This is **Verified current behavior** and should either be removed or intentionally documented as a requirement.

## Persistence priorities

These items are also tracked in [Technical debt](./technical-debt.md):

1. Enforce confirmed uniqueness for Answer, Cover, and fiscal-year Enrollment cardinalities.
2. Make verdict/finalize concurrency explicit with state checks and locking, optimistic versioning, serializable isolation, or idempotency.
3. Add and live-validate latest-log, FK, and fiscal-date indexes.
4. Establish one timestamp/timezone policy and Bangkok fiscal-boundary tests.
5. Define production schema/import, backup, rollback, and drift-verification procedures.
6. Add database constraints for high-value numeric, hierarchy, assignment, and log-semantic rules.
7. Add MinIO/PostgreSQL compensation or reconciliation.
8. Tighten DTO enum, email, and numeric constraints.

## Verification limits

This document was produced without connecting to or mutating a database. Index and constraint recommendations require live catalog inspection, representative data, and query-plan validation before implementation.
