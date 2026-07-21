# TWHP maintainer documentation

These guides describe the repository behavior verified on 2026-07-15. They separate current source
behavior from inferred operational consequences and organizational unknowns. Source and executable
configuration remain stronger evidence than prose; if they disagree, record the conflict rather than
silently rewriting history or intent.

## New maintainer reading order

For a first complete orientation:

1. [Maintainer handover](handover.md) — current status, first-day checklist, fragile areas, and unresolved organizational questions.
2. [Architecture](architecture.md) — processes, dependencies, lifecycle, and system boundaries.
3. [Project structure](project-structure.md) — where code, configuration, tests, and support material live.
4. [Domain model](domain-model.md) — actors, entities, vocabulary, and workflow state.
5. [Business rules](business-rules.md) — current load-bearing behavior and known intent/code conflicts.
6. [Authentication and authorization](authentication-authorization.md) — login, cookies, OTP, roles,
   scope enforcement, and security risks.
7. [Database](database.md) — schema, invariants, seed behavior, and persistence boundaries.
8. [API conventions](api-conventions.md) — routing, DTOs, statuses, errors, and integration behavior.
9. [Technical debt](technical-debt.md) — severity-ranked defects, risks, and remediation order.
10. [Development](development.md) and [testing](testing.md) — safe local setup and truthful validation.
11. [Deployment](deployment.md) and [troubleshooting](troubleshooting.md) — profiles, release gaps,
   diagnosis, and recovery boundaries.

Read the relevant [architecture decision records](adr/) before changing scoring, authentication,
review/finalization, negotiation, or evidence deletion.

## AI agent reading order

1. Read the repository-level [AGENTS.md](../AGENTS.md).
2. Read the risk and authority summary in [Maintainer handover](handover.md).
3. Inspect `git status` and preserve unrelated or pre-existing changes.
4. Use the task map below to load only the relevant maintained guides.
5. Inspect the cited source/configuration before editing; documentation is navigation, not a substitute
   for current code evidence.
6. Read relevant [ADRs](adr/) and surface conflicts with `CONTEXT.md` or older prose explicitly.
7. Follow the safe validation rules in [testing](testing.md) and the handoff requirements in
   [AGENTS.md](../AGENTS.md).

Do not infer permission to run database mutation, integration tests, job replay, deployment, or secret
operations from the presence of a command in these documents.

## Guide purposes

| Guide | Purpose |
| --- | --- |
| [Maintainer handover](handover.md) | System status, stable/fragile areas, first-day and pre-change checklists, recommended work, and organizational unknowns. |
| [Architecture](architecture.md) | Runtime processes, dependency direction, request lifecycle, shared infrastructure, and architectural risks. |
| [Project structure](project-structure.md) | Directory ownership, route autoload conventions, entry points, generated/history material, and change locations. |
| [Domain model](domain-model.md) | Actors, core entities, relationships, workflow states, and canonical vocabulary. |
| [Business rules](business-rules.md) | Current enrollment, assessment, evidence, verdict, finalization, score, and grade behavior, including conflicts. |
| [Authentication and authorization](authentication-authorization.md) | Credentials, JWT cookies, refresh flow, staff OTP, RBAC, scope checks, and security debt. |
| [Database](database.md) | Drizzle/PostgreSQL schema, enums, relationships, seed, transactions, lifecycle, and application-only invariants. |
| [API conventions](api-conventions.md) | Route discovery, public/protected surfaces, TypeBox DTOs, response/error patterns, OpenAPI drift, and integrations. |
| [Development](development.md) | Prerequisites, native and Compose workflows, configuration, service ports, and safe local commands. |
| [Testing](testing.md) | Test inventory, isolated versus integration commands, database safety, known results, and quality-tool limitations. |
| [Deployment](deployment.md) | Images, Compose profiles, ports, environment variables, reverse proxy, state, and unresolved production procedure. |
| [Troubleshooting](troubleshooting.md) | Evidence-safe diagnosis and recovery guidance across API, database, Redis/BullMQ, worker/SMTP, MinIO, and Nginx. |
| [Technical debt](technical-debt.md) | Severity-ranked observed defects, confirmed debt, potential risks, impacts, and prioritized remediation. |
| [ADRs](adr/) | Accepted historical design decisions for score calculation, OTP, review hierarchy, negotiation, verdict saves, and evidence deletion. |
| [Agent workflow guides](agents/) | Local issue-tracker, triage-label, and domain-document conventions used by engineering agents. |
| [API snapshot](api/) | Generated OpenAPI JSON/UI and derived API reference; useful for discovery but not authoritative for runtime authorization or status behavior. |

## Task-to-document map

| Task | Read first | Then consult |
| --- | --- | --- |
| Add or change an endpoint | [API conventions](api-conventions.md) | [Project structure](project-structure.md), [authentication](authentication-authorization.md), relevant domain guide |
| Change login, cookies, OTP, password reset, or roles | [Authentication and authorization](authentication-authorization.md) | [API conventions](api-conventions.md), [ADR-0002](adr/0002-email-otp-2fa-for-staff.md), [troubleshooting](troubleshooting.md) |
| Change enrollment, Cover, Answer, verdict, score, or grade behavior | [Business rules](business-rules.md) | [Domain model](domain-model.md), [database](database.md), relevant [ADRs](adr/) |
| Change schema, enum, relationship, or seed | [Database](database.md) | [Business rules](business-rules.md), [development](development.md), [deployment](deployment.md) |
| Change evidence upload/delete/presign behavior | [Business rules](business-rules.md) | [Authentication](authentication-authorization.md), [database](database.md), [troubleshooting](troubleshooting.md), [ADR-0006](adr/0006-delete-files-on-change-score.md) |
| Change email jobs, worker, Redis, or schedule | [Architecture](architecture.md) | [Deployment](deployment.md), [troubleshooting](troubleshooting.md), [authentication](authentication-authorization.md) |
| Run or add tests | [Testing](testing.md) | [Development](development.md), [database](database.md) |
| Change Docker, Nginx, environment, or release behavior | [Deployment](deployment.md) | [Architecture](architecture.md), [development](development.md), [troubleshooting](troubleshooting.md) |
| Diagnose an incident | [Troubleshooting](troubleshooting.md) | The affected integration/domain guide; [deployment](deployment.md) for topology |
| Plan a major refactor or remediation | [Technical debt](technical-debt.md) | [Architecture](architecture.md), [maintainer handover](handover.md), and affected domain guide |
| Create or triage local work | [Issue tracker](agents/issue-tracker.md) | [Triage labels](agents/triage-labels.md), [domain guide](agents/domain.md) |

## Where to Look Before Making Changes

| Change area | Primary source paths | Required documentation |
| --- | --- | --- |
| API bootstrap, errors, logging, request limits | `src/index.ts`, `src/routes/index.ts` | [Architecture](architecture.md), [API conventions](api-conventions.md) |
| Route or DTO contract | `src/routes/**`, `src/schema/**`, `src/schema/index.ts` | [API conventions](api-conventions.md), relevant role/domain guide |
| Authentication or role enforcement | `src/service/authentication.ts`, `src/middleware/**`, `src/routes/authentication/**` | [Authentication and authorization](authentication-authorization.md), [ADR-0002](adr/0002-email-otp-2fa-for-staff.md) |
| Factory enrollment and annual scoping | `src/service/enroll.ts`, `src/service/cover.ts`, `src/utils.ts` | [Business rules](business-rules.md), [domain model](domain-model.md), [database](database.md) |
| Answers, evidence, negotiation | `src/service/answer.ts`, `src/schema/answer.ts`, `src/utils.ts` | [Business rules](business-rules.md), [ADRs 0004–0006](adr/) |
| Evaluator review and finalization | `src/service/evaluator-review.ts`, `src/service/evaluator.ts`, `src/routes/evaluators/covers/**`, `src/routes/admins/covers/**` | [Business rules](business-rules.md), [authentication](authentication-authorization.md), [ADRs 0003–0006](adr/) |
| Score or grade | `src/service/scoreHelpers.ts`, `src/service/score.ts`, `src/schema/score.ts` | [Business rules](business-rules.md), [ADR-0001](adr/0001-score-calculated-on-demand.md) |
| Database schema or seed | `src/drizzle/schema.ts`, `src/drizzle/seed.ts`, `seed_data/`, `drizzle.config.ts` | [Database](database.md), [development](development.md), [deployment](deployment.md) |
| MinIO file access | `src/utils.ts`, `src/service/file.ts`, `src/routes/file/index.ts`, `nginx/nginx.conf`, `nginx/nginx.conf.template` | [Authentication](authentication-authorization.md), [API conventions](api-conventions.md), [troubleshooting](troubleshooting.md) |
| Queue, email, or scheduler | `src/queue/email.ts`, `src/worker/email.ts`, `src/workers.ts` | [Architecture](architecture.md), [deployment](deployment.md), [troubleshooting](troubleshooting.md) |
| Tests or quality tooling | `src/**/*.test.ts`, `src/**/*.integration.test.ts`, `src/test/setup.ts`, `bunfig.toml`, `biome.json` | [Testing](testing.md), [development](development.md) |
| Containers, proxy, environment | `Dockerfile`, `docker-compose.yaml`, `nginx/`, `src/config.ts` | [Deployment](deployment.md), [development](development.md), [troubleshooting](troubleshooting.md) |
| Cross-cutting risk or major refactor | Relevant source paths from the debt item | [Technical debt](technical-debt.md), [architecture](architecture.md), [maintainer handover](handover.md) |

## Authority and maintenance notes

- Current source/configuration is the authority for implemented behavior; these guides explain it and
  record verified conflicts.
- ADRs explain accepted design intent. If implementation conflicts with an ADR, surface the conflict
  before changing either side.
- `CONTEXT.md` remains useful for vocabulary and historical intent but contains known conflicts with
  current code and newer ADRs.
- `docs/api/openapi.json`, `docs/api/API.md`, and `docs/api/index.html` are snapshots refreshed from
  the live Elysia document on 2026-07-21. They can drift after later route/schema changes; verify
  middleware and service behavior directly because generated schemas are not the complete runtime
  authorization or failure contract.
- `docs/dev-otp-bypass.html`, `docs/evaluation-flow.html`, and `docs/evaluation-features-th.html` are
  focused historical/operator references, not the primary maintained handover set.
- When behavior changes, update the affected maintained guide and ADR where required. Verify local
  links and commands before handoff.
