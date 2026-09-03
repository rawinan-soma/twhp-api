# Technical debt and maintainability register

Audit date: 2026-07-15. Reviewed for currency on 2026-09-02; the deltas are marked **Update 2026-09-02** on the affected items and summarized under [Status of this register](#status-of-this-register). No item was closed.
Scope: synthesis of the architecture, database, API, domain, security, development/deployment, testing, and operations investigations, with targeted source spot-checks. This register describes repository evidence; it does not claim that an environment-dependent risk has occurred in production.

## Classification

- **Observed defect**: source implements behavior that is demonstrably unsafe, inconsistent, or contrary to the active contract.
- **Confirmed debt**: a known missing engineering capability or fragile design that raises change/operation cost.
- **Potential risk**: mechanics are verified, but severity or desired behavior depends on deployment or product policy that is not present in the repository.
- **Optional improvement**: useful maintainability work with no current defect demonstrated.

Severity reflects engineering and operational impact, not code style. “Required before handover” means the receiving team needs either a fix or an explicit, owned decision/runbook; it does not imply every item must be implemented before documentation can be published.

## Status of this register

Reviewed on 2026-09-02 against branch `dev`. The 2026-07-15 evidence still holds for TD-01 through TD-05 and TD-07 through TD-09 and TD-11 through TD-16: none of their subject files changed, and none of the work delivered since then targeted them. Four items moved:

| Item | Movement |
|---|---|
| TD-06 | Partly narrowed. ADR-0012 settled the accepted-change-score conflict and the change-score/evidence conflict; the remaining conflicts are unchanged. One new residue was added. |
| TD-10 | Inventory refreshed: 18 files / 315 declared cases, 201 isolated tests passing, Biome down to 3 errors. The gate itself is unchanged and still absent. |
| TD-13 | The README boilerplate item is closed; the rest stands. |
| TD-15 | Cover latest-log duplication is closed by `src/service/coverStatus.ts` (ADR-0010). Answer latest-log duplication, standard mapping, queue-name duplication, and the index question stand. |

Nothing here is safe to treat as fixed on the strength of a document date. Re-verify against source before acting on any item.

## Consolidated register

### TD-01 — Refresh cookies are trusted without JWT verification

- **Severity:** Critical
- **Category:** Observed defect
- **Evidence:** `getUserFromRefreshToken` hashes the supplied string and looks it up directly. `rotateToken` mints a new access token after that lookup. The only JWT parsing is `decodeJwt`, used to decide whether to rotate the refresh cookie; it does not verify signature, issuer algorithm, claims, or expiry. An exact token whose database hash remains stored can therefore refresh after its JWT expiry.
- **Path / symbol:** `src/service/authentication.ts` — `helper.getUserFromRefreshToken`, `rotateToken`; `src/middleware/jwt.ts` refresh path.
- **Engineering impact:** The nominal refresh expiry is not an enforced session boundary. Session tests do not cover expired or tampered refresh tokens.
- **Operational / business impact:** A copied refresh cookie can retain account access beyond the documented lifetime, including privileged accounts, until its stored hash changes.
- **Remediation:** Verify the token with `REFRESH_JWT_SECRET`, an explicit allowed algorithm, required claims, and expiry before hash lookup. Define absolute versus sliding lifetime, clear invalid cookies, revoke refresh hashes on password reset/change where policy requires, and add expiry/tamper/hash-mismatch/concurrency tests.
- **Required before handover:** Yes
- **Confidence:** High

### TD-02 — Object-level authorization is missing on evaluator details and file presigning

- **Severity:** High
- **Category:** Observed defect
- **Evidence:** Evaluator detail handlers pass a caller-selected numeric ID to unscoped `getEnrollById` / `getFactoryById`, although evaluator list/review paths enforce health region. The file endpoint accepts any non-empty object name from any authenticated role and signs it without checking owner, enrollment, cover, answer, region, or reviewer category. Enrollment/answer reads disclose stored object names, so the two defects compose. The generated URL lasts five seconds, while the route says five minutes; short expiry is not authorization.
- **Path / symbol:** `src/routes/evaluators/enrolls/[id].ts`; `src/routes/evaluators/factories/[id].ts`; `src/service/enroll.ts#getEnrollById`; `src/service/factory.ts#getFactoryById`; `src/routes/file/index.ts`; `src/service/file.ts#getPresignedUrl`; `src/utils.ts#getPresignedUrl`.
- **Engineering impact:** Authorization rules are inconsistently embedded in individual queries, making omissions easy and negative-scope tests incomplete.
- **Operational / business impact:** An evaluator may read out-of-region factory/contact/certificate data, and any authenticated caller with a disclosed key may retrieve evidence belonging to another resource.
- **Remediation:** Resolve evaluator identity and region for detail reads and return 404 for out-of-scope IDs if that is the chosen disclosure policy. Replace free-form filename authorization with a resource-scoped endpoint that derives the object key after checking role, ownership, region, and category. Add cross-region and cross-owner negative tests and audit presign decisions.
- **Required before handover:** Yes
- **Confidence:** High on missing checks; confidentiality boundary still needs formal product confirmation

### TD-03 — Production schema/data release is a successful no-op and artifacts are not immutable

- **Severity:** Critical
- **Category:** Confirmed debt
- **Evidence:** Compose's `migrate-prod` command only echoes “do not migrate in production, import csv directly,” then succeeds, allowing API startup. No production import command, schema migration artifact, drift check, CI/CD workflow, build/push procedure, backup gate, rollback procedure, or release manifest is checked in. Production uses `rawinan/twhp-elysia-api:latest`; Bun, MinIO, Nginx, and other service images are also floating or major-only. `Dockerfile` and `db:seed` require `seed_data/`, but `.gitignore` excludes it and Git tracks no files there, so a clean clone cannot reproduce the release build/seed without an undocumented out-of-band input.
- **Path / symbol:** `docker-compose.yaml` — `migrate-prod`, `api`, `worker`, image declarations; `Dockerfile`; repository workflow inventory.
- **Engineering impact:** A deployment cannot be reproduced or tied reliably to source/schema state. A green dependency gate does not prove schema compatibility.
- **Operational / business impact:** Release, recovery, and rollback can fail during an incident or introduce irreversible data drift; the deployed version cannot be established from Compose alone.
- **Remediation:** Define an owned, reviewable production schema/data promotion process with preflight drift validation, backup, import/migration, post-check, and rollback. Establish an authoritative protected source/packaging contract for `seed_data/`. Publish immutable application and base image tags/digests with provenance and a promotion/rollback runbook. Make the startup gate fail until the actual release step succeeds.
- **Required before handover:** Yes
- **Confidence:** High for repository absence; any external release process is Unknown

### TD-04 — Core cardinalities and submission completeness are not durable under concurrency

- **Severity:** High
- **Category:** Observed defect
- **Evidence:** Services pre-check “one enrollment per factory/fiscal year,” “one cover per enrollment,” and “one answer per cover/question,” but the schema has no corresponding unique constraints. Concurrent requests or direct imports can create duplicates. Submission completeness compares counts, so duplicate answers can mask a missing question. Current unique indexes cover identifiers and account fields, not these domain keys.
- **Path / symbol:** `src/drizzle/schema.ts` — `enrolls`, `covers`, `answers`; `src/service/enroll.ts#create`; `src/service/cover.ts#create`; `src/service/answer.ts` creation/submission paths.
- **Engineering impact:** Application pre-checks are race-prone, query assumptions such as `.then(res => res[0])` become nondeterministic, and cleanup is harder after duplicates exist.
- **Operational / business impact:** A factory may have conflicting annual assessments, duplicated answers, incorrect completeness, scores, and review state.
- **Remediation:** Confirm the canonical fiscal-year key/timezone, clean existing duplicates, then add database uniqueness for enrollment/year, `covers.enroll_id`, and `(answers.cover_id, answers.question_id)`. Handle constraint conflicts as deterministic 409/idempotent results. Validate submission by expected-versus-actual question ID set equality.
- **Required before handover:** Yes
- **Confidence:** High

### TD-05 — Finalization has no idempotency or concurrency guard

- **Severity:** High
- **Category:** Observed defect
- **Evidence:** `finalize` authorizes region/level and checks answer logs, but never reads the latest cover state, locks/version-checks the cover, or accepts an idempotency key. Repeated or concurrent calls can append duplicate answer/cover transitions and enqueue duplicate result emails. Accepted ADR/CONTEXT prose claims a second-finalizer/cover-race guard that source does not implement.
- **Path / symbol:** `src/service/evaluator-review.ts#finalize`; `docs/adr/0005-per-answer-verdict-save.md`; `CONTEXT.md` finalization statements.
- **Engineering impact:** Append-only “latest log wins” state is being used without a compare-and-set boundary; retries are not safe.
- **Operational / business impact:** Duplicate transitions/notifications, conflicting reviewers, and non-reconstructable workflow timing can affect official assessment results.
- **Remediation:** Choose semantics for already-finalized calls (idempotent success or explicit conflict), then enforce latest cover state inside the transaction using row locking, optimistic versioning, serializable isolation, or a unique transition/idempotency record. Give notification jobs deterministic IDs. Add repeated and concurrent finalize tests.
- **Required before handover:** Yes
- **Confidence:** High

### TD-06 — Workflow authorization and scoring rules are not represented by one enforceable state model

- **Severity:** High
- **Category:** Potential risk
- **Evidence:** Active prose says tier-1 verdict edits require Cover `in_review`, but `saveAnswerVerdict` checks answer state/authorship/category without reading cover state. Factory answer update/save paths admit answer states without a single cover/answer transition matrix. Enrollment fields can change after submission/finalization. Further source/document conflicts exist around immutable factory choice versus overwriting `selectedChoice`, standard auto-credit acceptance, N/A eligibility, the Gold “special” set, assignment meaning, and evidence retention.
- **Path / symbol:** `src/service/evaluator-review.ts#saveAnswerVerdict`; `src/service/answer.ts` update/negotiation paths; `src/service/enroll.ts#updateEnroll`; `src/service/scoreHelpers.ts`; `CONTEXT.md`; ADRs 0004–0006; `seed_data/questions.json`.
- **Engineering impact:** Rules are distributed across services, append-only logs, seed metadata, and contradictory documents. A local fix can silently change scoring, provenance, or allowed transitions elsewhere.
- **Operational / business impact:** Assessments may be edited in an unintended phase, historical decisions may not be reconstructable, and grades/evidence retention may differ from policy.
- **Remediation:** Product owners must settle the conflict list, then encode one transition matrix and invariant layer shared by commands. Preserve immutable claim/verdict provenance if auditability is required. Add rule-focused boundary tests for state, N/A, standards, grade thresholds, fiscal dates, and post-submit mutability.
- **Update 2026-09-02:** ADR-0012 settled two of the listed conflicts — the immutable-factory-choice versus overwriting `selectedChoice` question (finalize now performs the write, deliberately, and the original claim is preserved nowhere), and evidence retention on a change score (preserved; only hard rejects delete). Standard auto-credit acceptance, N/A eligibility, the Gold `special` set, assignment meaning, and the absent transition matrix are unchanged. One residue was added: a `finished` Answer can keep a score whose backing certificate a later hard reject deleted, because the reset is bounded to non-`finished` Answers to preserve immutability.
- **Required before handover:** Yes — decisions are required even if implementation follows later
- **Confidence:** High on implementation/document divergence; intended behavior is partly Unknown

### TD-07 — MinIO and PostgreSQL changes can leave missing or orphaned evidence

- **Severity:** High
- **Category:** Confirmed debt
- **Evidence:** Upload-before-DB-write can orphan new objects on DB failure. Some replacements delete the old object before upload/DB update, so a failed replacement can leave a persisted filename pointing to a deleted object. Non-strict deletion suppresses errors. Finalize deletes multiple objects with `Promise.all` before its DB transaction; one delete can fail after others succeeded, leaving unchanged DB references to removed files. There is no reconciliation job or transactional outbox/saga record.
- **Path / symbol:** `src/service/answer.ts`; `src/service/enroll.ts`; `src/service/evaluator-review.ts#finalize`; `src/utils.ts#uploadFile`, `deleteFile`, `deleteFileStrict`.
- **Engineering impact:** Cross-store operations have no durable recovery record, compensation guarantee, or idempotent reconciliation path.
- **Operational / business impact:** Compliance evidence may disappear while still referenced, or storage can accumulate inaccessible objects and cost.
- **Remediation:** Define the desired consistency model. Prefer upload-new → DB compare-and-set → delete-old, with durable pending-operation/outbox records and periodic reconciliation. For finalize, persist intent/state before deletion or make deletion retryable after DB transition rather than treating parallel external deletes as atomic. Document manual repair tooling.
- **Required before handover:** Yes
- **Confidence:** High

### TD-08 — Authentication abuse resistance and session revocation are incomplete

- **Severity:** High
- **Category:** Confirmed debt
- **Evidence:** Password login performs bcrypt for every attempt against an existing username without account/network throttling; unknown usernames short-circuit. Password-reset responses distinguish unknown email (404), password reset/change paths do not revoke the stored refresh hash, and several registration/reset/first-login/update schemas use unconstrained `t.String()` and accept blank passwords. First-login staff receive cookies before OTP, and the password-change step neither rotates nor revokes that refresh hash. OTP has controls, but challenge creation and queue publication are non-atomic and challenge verification uses multi-command Redis state changes.
- **Path / symbol:** `src/service/authentication.ts`; `src/schema/authentication.ts`; inline authentication/factory/admin credential schemas.
- **Engineering impact:** Security policy is fragmented across DTOs and Redis/database flows, increasing bypass and regression risk.
- **Operational / business impact:** Credential stuffing and account enumeration are easier; password recovery may not eject an attacker with a refresh token; failed OTP delivery can leave a throttled live challenge.
- **Remediation:** Reject blank/weak passwords through one bounded policy, add trusted account-plus-network throttling, make reset responses uniform if enumeration matters, revoke/rotate sessions according to an explicit multi-device and first-login policy, and make OTP challenge issuance/verification atomic or enforce the active challenge ID. Test all credential-change routes and the pre-OTP first-login refresh lifecycle.
- **Required before handover:** Yes
- **Confidence:** High

### TD-09 — Secret, network, and browser-edge posture depends on undocumented deployment controls

- **Severity:** High
- **Category:** Potential risk
- **Evidence:** Compose hard-codes `minioadmin` root credentials. PostgreSQL and unauthenticated/non-TLS Redis are host-published by production-inclusive profiles. In `nginx.conf.template`, the API-key `map` accepts the substituted `NGINX_API_KEY`; if that value renders empty, a request with no header can match it and pass the gate, and Compose does not validate non-empty substitution. The application/repository Nginx has no CORS policy, CSRF origin/token check, general browser security headers, or trusted-proxy definition. A fixed weak DOED seed credential is used by development and staging seed flow. Actual firewall, outer proxy/TLS, secret store, and credential reuse are not present in the repository.
- **Path / symbol:** `docker-compose.yaml`; `src/drizzle/seed.ts`; `src/index.ts`; `nginx/nginx.conf`; `nginx/nginx.conf.template`.
- **Engineering impact:** Secure behavior cannot be inferred from checked-in deployment configuration, and environment promotion can accidentally retain development defaults.
- **Operational / business impact:** An empty production/staging API key can make the shared proxy gate fail open. If externally reachable or reused, defaults and exposed stateful services can enable data/queue/storage compromise; browser mutations may rely only on cookie SameSite behavior.
- **Remediation:** Make Nginx startup fail when `NGINX_API_KEY` is empty and inspect the rendered map before traffic. Move admin/application secrets to managed storage, use least-privilege MinIO credentials, prevent development seed in staging/production-like environments, restrict stateful ports and add Redis auth/TLS as required. Document the trusted proxy, TLS termination, frontend origins, CORS/CSRF/header policy, and secret rotation owner.
- **Required before handover:** Yes — deployment owners must confirm compensating controls
- **Confidence:** High on repository configuration; external exposure is Unknown

### TD-10 — Test and CI command contracts do not provide a dependable quality gate

- **Severity:** High
- **Category:** Confirmed debt
- **Evidence (2026-07-15; superseded counts — see the 2026-09-02 update below):** The repository had 12 Bun test files with 167 `it(...)` declarations, but `bun run test` intentionally exits 1. Five isolated files passed separately (86 tests, 0 failures); the 81 PostgreSQL integration tests were not run because the global preload falls back to the ordinary local `twhp` development database and tests perform real inserts/deletes. There is no `TEST_DATABASE_URL`, test-only database guard, per-run schema/database, migration/seed bootstrap, or rollback harness. The current read-only Biome invocation checked 77 files and failed with 8 errors and 30 warnings. Package format/lint/check scripts mutate files, no direct pinned TypeScript binary/typecheck script exists, and no CI or coverage gate is checked in. High-risk gaps include refresh/RBAC middleware, password reset/revocation, object authorization, fiscal boundaries, write concurrency/idempotency, cross-store recovery, and worker delivery.
- **Update 2026-09-02:** the inventory grew to 18 files and 315 declared cases; the 8 isolated files now run in one process (201 pass, 0 fail) and the read-only Biome check is down to 3 errors / 32 warnings / 3 infos across 86 files. The new coverage is real — the pagination contract, route composition, and cover-status resolution are all tested — but every structural finding below is unchanged: `bun run test` still exits 1, there is still no `TEST_DATABASE_URL` or test-only guard, no ephemeral database, no pinned TypeScript, and no CI.
- **Path / symbol:** `package.json` scripts; `bunfig.toml`; `src/test/setup.ts`; test files under `src/`; repository workflow inventory.
- **Engineering impact:** Contributors and automation cannot invoke one canonical, hermetic verification pipeline. A careless bare integration run can mutate a developer database, shared fixture IDs/order make parallelism risky, overlapping Bun module mocks require separate processes, and the current static-analysis baseline is red.
- **Operational / business impact:** Releases may ship with session, authorization, assessment integrity, or deployment regressions without a failed gate.
- **Remediation:** Make `bun run test` truthful and safe, split isolated and integration suites, require `TEST_DATABASE_URL` with a fail-closed test-only guard, and provision migrated/seeded ephemeral PostgreSQL with per-run isolation. Add non-mutating format/lint and pinned typecheck commands, then CI jobs for isolated tests, static checks, and integration tests. Keep auth mock suites in separate processes until their module seams are isolated. Prioritize tests named in TD-01/02/04/05/06/07 before broad coverage targets.
- **Required before handover:** Yes — at minimum define and demonstrate the release quality gate
- **Confidence:** High for inventory, command behavior, safe-test results, and isolation hazards; Medium for full integration-suite stability because it was deliberately not run against the non-disposable fallback database

### TD-11 — Email delivery is neither transactionally reliable nor adequately observable

- **Severity:** High
- **Category:** Confirmed debt
- **Evidence:** Finalize commits database changes, then enqueues email outside the transaction; enqueue failure is caught and finalization still returns success. Authentication writes challenge/throttle state before queue publication. Evaluator result jobs lack the retry/retention policy used by OTP/reset jobs and have no deterministic job ID. Required `SMTP_STARTTLS` and `SMTP_SECURE` values are ignored by `nodemailer.createTransport`.
- **Path / symbol:** `src/service/evaluator-review.ts#finalize`; `src/service/authentication.ts#createChallenge`; `src/queue/email.ts`; `src/worker/email.ts` transporter and job switch.
- **Engineering impact:** Database/Redis state and notification intent diverge, retries can duplicate mail, and two validated security controls have no runtime effect.
- **Operational / business impact:** Factories may never learn that a result or revision is ready; operators cannot distinguish delayed, failed, or duplicate notifications; SMTP may not use the intended TLS mode.
- **Remediation:** Use a transactional/durable outbox or persisted notification intent, deterministic job IDs, explicit retry/backoff/retention/dead-letter policy, and delivery-status visibility. Wire and test TLS flags or remove them and document provider-enforced TLS.
- **Required before handover:** Yes
- **Confidence:** High

### TD-12 — Health, shutdown, telemetry, backup, and recovery procedures are absent

- **Severity:** High
- **Category:** Confirmed debt
- **Evidence:** `/health` returns a constant string and is used as the container healthcheck; it establishes only API process reachability, not PostgreSQL, Redis, MinIO, queue, SMTP, or worker readiness. The check and Nginx hard-code port 3000 despite configurable `APP_PORT`, and the PostgreSQL health command hard-codes identity values while its image accepts environment-controlled user/database settings. The worker has no healthcheck and uses ad hoc console logging; request-to-queue correlation, BullMQ failed/stalled event hooks, centralized retention/redaction, metrics, traces, alert thresholds, graceful shutdown, backup/restore tests, SLO/RPO/RTO definitions, and owned replay/incident procedures are absent from the repository. Request logging includes full URLs, so `fileName` query values may enter logs.
- **Path / symbol:** `src/routes/index.ts`; `src/index.ts`; `src/workers.ts`; `src/worker/email.ts`; `docker-compose.yaml` healthchecks; repository operations inventory.
- **Engineering impact:** Failure modes cannot be detected or correlated consistently; health can be falsely green or falsely red after configuration changes, and process termination may abandon in-flight work/connections. Operators lack a safe, repeatable way to distinguish or repair database, queue, and object-store partial failure.
- **Operational / business impact:** Orchestrators can route traffic to a dependency-broken process; queue failures/data loss may remain silent; recovery time and data loss bounds are undefined.
- **Remediation:** Separate liveness and readiness, parameterize or explicitly fix healthcheck invariants, and add worker/queue health, structured BullMQ events, redacted correlation IDs, metrics/alerts, and graceful drain/close hooks. Define log retention/redaction, on-call ownership, RPO/RTO, and backup/restore/rollback/replay procedures; exercise them against PostgreSQL, Redis/BullMQ, and MinIO without replaying non-idempotent operations blindly.
- **Required before handover:** Yes — owners and minimum runbooks must be named
- **Confidence:** High for repository/configuration behavior and missing checked-in capabilities; current deployed monitoring, backups, and external runbooks are Unknown

### TD-13 — API contract and generated documentation drift from deployed behavior

- **Severity:** Medium
- **Category:** Confirmed debt
- **Evidence:** Four operations document 201 but return the default 200. Root validation maps errors to 400 while route-only tests expect 422. JWT/domain failures are JSON but RBAC 403 is a bare string. OpenAPI lacks cookie security schemes and common middleware failures, advertises the development bypass header, and has no reproducible source-commit/freshness check. The presign description says five minutes while source signs for five seconds.
- **Path / symbol:** factory registration, enrollment, cover, and reset-request routes; `src/index.ts#onError`; `src/middleware/jwt.ts`; `src/middleware/rbac.ts`; `docs/api/openapi.json`; `docs/api/API.md`.
- **Engineering impact:** Clients, tests, and generated schemas encode different contracts; integrators must learn behavior through runtime failures.
- **Operational / business impact:** Client error handling, creation flows, and file retrieval can fail unexpectedly; security requirements can be omitted by generated clients.
- **Update 2026-09-02:** the root `README.md` was rewritten as a real project entry point, closing that sub-item. The OpenAPI snapshot has not been regenerated since the pagination and score-change work, so its drift is now wider: the nine staff lists return an `{ items, meta }` envelope the snapshot does not describe, and the verdict semantics it documents predate ADR-0012.
- **Remediation:** Decide canonical status/error semantics, add shared JSON error schemas and cookie security components, align tests/handlers, and make OpenAPI generation/checking reproducible with source metadata and environment-specific treatment of dev controls. Regenerate the snapshot with `scripts/gen-api-docs.ts` as part of that work.
- **Required before handover:** No, except security semantics already covered above
- **Confidence:** High

### TD-14 — Service boundaries are shallow and infrastructure is hidden global state

- **Severity:** Medium
- **Category:** Confirmed debt
- **Evidence:** Service factories inject a database but close over production Redis, BullMQ, MinIO, environment, clock, utilities, or other singleton services. Services return Elysia transport status objects. Import-time singletons open/construct infrastructure transitively. `utilities()` combines fiscal clock, Redis construction, upload/delete, and presigning. Large modules mix many responsibilities: `answer.ts` ~1,042 lines, `authentication.ts` ~631, `enroll.ts` ~570, `evaluator-review.ts` ~518, and the email worker ~236.
- **Path / symbol:** service modules under `src/service/`; `src/utils.ts`; `src/queue/email.ts`; `src/worker/email.ts`; singleton exports at module bottoms.
- **Engineering impact:** Unit isolation requires global mocking or live infrastructure; changing workflow, storage, or authentication touches large coupled modules. Importing narrow code can trigger unrelated config/connection requirements.
- **Operational / business impact:** Slower, riskier changes and lower testability increase lead time for fixes in assessment and authentication workflows.
- **Remediation:** Introduce seams only at true external boundaries: injected clock, object store, Redis/session store, queue/outbox, and mail adapter. Return framework-neutral domain results. Split large services by cohesive command/query/workflow responsibility after characterization tests; do not add pass-through abstractions with no testing or change leverage.
- **Required before handover:** No
- **Confidence:** High

### TD-15 — Duplicated conventions and missing indexes raise change and scale risk

- **Severity:** Medium
- **Category:** Potential risk
- **Update 2026-09-02:** Cover latest-log resolution is now centralized in `src/service/coverStatus.ts` with both query shapes and 17 isolated tests, and a second `coverLogs` subquery is an explicit review failure ([ADR-0010](adr/0010-lateral-latest-cover-log-resolution.md)). ADR-0008 removed a row-multiplication defect from the factory lists in the process. Answer latest-log queries, standard mapping, and queue-name duplication are unchanged, and the index question is still open — the staff lists now issue a count query per request, which raises rather than lowers the value of validating the proposed indexes.
- **Evidence:** Latest-log-wins queries are independently implemented across services; standard type/boolean/URL mapping is repeated across service code, schema columns, enum values, and seed JSON with casing differences. Queue job names/payloads are stringly duplicated between producers and the worker. Dominant foreign-key, latest-log, region/year list access patterns have few supporting indexes beyond unique identifiers. Live `EXPLAIN` evidence and production cardinality are unavailable.
- **Path / symbol:** `src/service/answer.ts`; `src/service/evaluator-review.ts`; `src/service/enroll.ts`; `src/service/score.ts`; `src/drizzle/schema.ts`; `seed_data/questions.json`; `src/queue/email.ts`; `src/worker/email.ts`.
- **Engineering impact:** Adding a standard or changing state ordering requires shotgun edits; divergent query ordering can change current state. Missing indexes may become expensive as logs grow.
- **Operational / business impact:** Inconsistent scoring/certificate behavior or degraded list/review latency at production scale.
- **Remediation:** Centralize standard descriptors, typed queue contracts, and reusable latest-log query helpers while retaining explicit query semantics. Validate proposed foreign-key/latest-log/region/fiscal indexes with production-size `EXPLAIN (ANALYZE, BUFFERS)` before applying.
- **Required before handover:** No
- **Confidence:** High on duplication/current indexes; performance impact is Unknown without live plans

### TD-16 — Runtime/configuration and documentation authority are not reproducible

- **Severity:** Medium
- **Category:** Confirmed debt
- **Evidence:** Exact Bun support is undeclared, dependencies request `latest`, and API/worker packaging differs (API runs source/autoload; worker is a compiled platform-specific binary). `APP_PORT` is configurable but Docker/Nginx/healthchecks assume 3000. Drizzle config imports the full eager app config but directly reads `process.env.DATABASE_URL`; seed does the same. No value-free `.env.example` exists. Accepted ADRs, `CONTEXT.md`, historical intent files, static OpenAPI, and implementation contain conflicting claims about finalization, choice provenance, file deletion, and email fields.
- **Path / symbol:** `package.json`; `bun.lock`; `Dockerfile`; `docker-compose.yaml`; `nginx/`; `drizzle.config.ts`; `src/drizzle/seed.ts`; `src/config.ts`; `CONTEXT.md`; `docs/adr/`; `memory-bank/intents/`; `docs/api/`.
- **Engineering impact:** Local/CI/container behavior can differ; database tooling requires unrelated secrets; maintainers cannot tell which document is normative without repository archaeology.
- **Operational / business impact:** Environment drift and stale rules can cause failed deploys or incorrect assessment changes.
- **Remediation:** Pin Bun and release dependencies/images, either enforce container port 3000 or template every consumer, isolate tool-specific config, publish a secret-free environment schema, and establish/document authority order and supersession markers for ADRs, domain context, generated API artifacts, and historical requirements.
- **Required before handover:** Yes for authority order and runtime/deployment invariants; broader refactor No
- **Confidence:** High

## Explicit unknowns

The receiving team should not infer answers to these from source:

1. Whether evaluator health region and reviewer category are formal confidentiality boundaries for every detail and file type.
2. Whether refresh sessions should be absolute or sliding, whether multiple devices are supported, and which credential changes revoke sessions.
3. Canonical workflow semantics for cover/answer state, accepted-choice provenance, standard auto-credit, N/A, grade special values, assignment, enrollment freeze, and evidence deletion.
4. Canonical fiscal timezone/instant model and how annual uniqueness should be represented durably.
5. Actual production schema/import, release, backup/restore, image provenance, rollback, and disaster-recovery processes outside the repository.
6. External firewall, trusted proxy, TLS termination, CORS/CSRF, security headers, secret store/rotation, and whether published PostgreSQL/Redis ports are reachable.
7. Production data volume/query plans, queue durability, dead-letter/manual replay, SMTP delivery monitoring, and SLO/alert ownership.
8. Whether five-second presigned URLs, 200-versus-201 creation responses, and 400-versus-422 validation are intentional contracts.
9. Supported Bun version, deployment CPU architecture(s), and whether staging is intentionally a development-style push/seed environment.
10. Current full integration-suite status, type correctness, coverage percentage, full-suite parallel safety, and the behavior of dependencies under real failure remain Unknown; the audit safely ran only 86 isolated tests and a read-only Biome check.

## Prioritized remediation sequence

1. **Contain active security exposure:** fix refresh verification; confirm and enforce evaluator/file object scope; rotate/remove unsafe defaults and confirm stateful-service exposure.
2. **Freeze workflow decisions:** settle session lifetime, object authorization, state transitions, choice provenance, standards/N/A/grade, evidence retention, and fiscal-time rules. Record the authority order.
3. **Protect integrity at write boundaries:** clean duplicates; add unique constraints and set-equality validation; make finalize state-guarded/idempotent/concurrency-safe.
4. **Make external effects recoverable:** redesign evidence replacement/finalize deletion around durable intent and reconciliation; add notification outbox/idempotent jobs and SMTP TLS/retry policy.
5. **Establish a release safety net:** make canonical test/non-mutating quality commands, add the high-risk regression tests, pin runtime/artifacts, and gate releases in CI.
6. **Make production repeatable:** implement schema/data promotion, immutable build provenance, backups, drift checks, rollback, readiness, worker health, and minimum incident/replay runbooks.
7. **Reduce future change cost:** separate external ports from transport/domain logic, split characterized hotspots, centralize standard/job/latest-log conventions, and validate indexes with production plans.
8. **Regenerate the contract and handover docs:** align statuses/errors/security schemes, mark superseded documents, publish environment/runtime invariants, and attach evidence of the release/restore process.

## Contradictions and decisions required

1. **Refresh validity:** ADR/API prose says a valid, expiring refresh token is required; source requires only exact hash equality. Decide absolute/sliding semantics before fixing TD-01.
2. **Finalizer race:** CONTEXT/ADRs claim a single finalizer removes races or that a second call is guarded; source has no cover-state/locking/idempotency guard. Choose repeat-call and concurrency semantics.
3. **Review/edit state:** CONTEXT restricts evaluator/factory activity by cover phase; services use partial answer-state checks. Approve one transition matrix.
4. **Accepted choice and score:** CONTEXT/ADR-0004 says factory choice remains immutable and score uses accepted choice; negotiation source overwrites `selectedChoice`, and score reads it. Choose the audit model.
5. **Standards/N/A/grade:** source, seed metadata, and domain prose disagree on accepted standard score, N/A eligibility, and which `special` values gate Gold. Product decision and boundary tests are required.
6. **Evidence deletion:** ADR-0006/source delete evidence for every rejected answer at finalize; older CONTEXT/ADR-0005 prose says hard rejects only. Treat ADR-0006 as authority or reverse the code, then update all stale material.
7. **Cardinality:** domain language treats one enrollment/year, cover/enrollment, and answer/cover/question as guarantees; the database does not. Confirm keys and cleanup before constraints.
8. **Assignment and scope:** enrollment stores named evaluator IDs, while review authorization uses any same-region/level actor. Decide whether assignment is authorization, routing, or audit-only.
9. **Production migration:** comments name a production migration/import phase; Compose only echoes and succeeds. Identify the external process or replace the no-op.
10. **Contract status:** OpenAPI/tests/runtime disagree on 200/201 and 400/422; middleware error bodies also differ. Pick one public contract.
11. **Presign lifetime:** route text says five minutes, implementation says five seconds. Choose based on UX only after resource authorization is fixed.
12. **SMTP security:** TLS flags are mandatory configuration but unused. Wire them or remove the misleading contract.
13. **Deployment topology:** `APP_PORT` is configurable while the stack requires 3000; production edge/TLS and `shared-web-network` ownership are absent. Fix or document the invariant and owner.

## Review limits

This is a debt synthesis, not a fresh full-repository audit. Spot-checks were limited to the highest-impact overlaps and contradictions. No database, Redis, MinIO, SMTP, Docker deployment, production traffic, or live query plan was exercised. Severity for environment-dependent items must be revisited when deployment evidence becomes available.
