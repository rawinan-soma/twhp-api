# TWHP maintainer documentation

These guides describe the repository behavior verified on 2026-07-15, refreshed for transfer on
**2026-09-02** (branch `dev`), and partly re-checked on **2026-11-11** at `f194141`, where `main`,
`staging`, and `dev` are identical. They separate current source behavior from inferred operational
consequences and organizational unknowns. Source and executable configuration remain stronger
evidence than prose; if they disagree, record the conflict rather than silently rewriting history or
intent.

Verification currency, by document: `handover`, `architecture`, `domain-model`, `database`,
`technical-debt`, and the root `CONTEXT.md` were re-checked against source on 2026-11-11. The other
guides and the ADRs were checked on their stated dates. Several subject files changed between
2026-11-04 and 2026-11-10 — `src/middleware/` (scoped role guards), `src/service/authentication.ts`
(Invitation acceptance), `src/config.ts` (`EVALUATION_PERIOD_END`), and `docker-compose.yaml`
(RustFS) — so check a guide's stated date before relying on what it says about them. `Dockerfile`
and `nginx/` are unchanged since 2026-07-15.

## New maintainer reading order

For a first complete orientation:

0. The root [`README.md`](../README.md) — fastest orientation if you have never seen the repository.
1. [Maintainer handover](handover.md) — current status, work completed since the original audit, first-day checklist, fragile areas, the transfer checklist, and unresolved organizational questions.
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
review/finalization, evidence deletion, list pagination, Cover-status resolution, what a reader role
may see of a Cover, or how staff accounts are created.

| ADR | Subject |
|---|---|
| [0001](adr/0001-score-calculated-on-demand.md) | Score is computed on demand; the Grade is stored at finalize |
| [0002](adr/0002-email-otp-2fa-for-staff.md) | Email OTP as staff 2FA, Redis-only challenge state |
| [0003](adr/0003-hierarchical-odpc-gated-cover-review.md) | Hierarchical review with ODPC as the sole finalizer |
| [0004](adr/0004-verdict-score-consensus-loop.md) | Verdict Score and the four-value answer status. **Its consensus loop is superseded in part by 0012.** |
| [0005](adr/0005-per-answer-verdict-save.md) | Durable per-answer verdict saves, separate from finalize |
| [0006](adr/0006-delete-files-on-change-score.md) | **Superseded in full by 0012.** Deleting evidence on a change score |
| [0007](adr/0007-pagination-envelope-scoped-exception.md) | The `{ items, meta }` envelope is scoped to the nine staff lists |
| [0008](adr/0008-exists-subquery-for-enrolled-filter.md) | `EXISTS` rather than a join for the enrolled filter |
| [0009](adr/0009-offset-pagination-for-staff-lists.md) | Offset pagination with a mandatory total order |
| [0010](adr/0010-lateral-latest-cover-log-resolution.md) | One module owns latest-cover-log resolution |
| [0011](adr/0011-two-phase-read-for-computed-list-items.md) | Page-scoped hydration for computed list items |
| [0012](adr/0012-score-changes-are-terminal.md) | A score change is terminal; the loop survives for hard rejects only |
| [0013](adr/0013-province-scoped-read-only-cover-review.md) | Provincial Officers read Covers in their province; `in_progress` is invisible and verdicts are redacted while `in_review` |
| [0014](adr/0014-consec-gold-and-the-gold-gate.md) | Five-grade ladder, the FY − 3 `consec-gold` rule, and the settled `gold` special gate |
| [0015](adr/0015-invitations-are-separate-from-accounts.md) | Invitations are separate from accounts; invited accounts skip the seeded first-login step |

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
| [ADRs](adr/) | Accepted design decisions 0001–0015: score calculation, OTP, review hierarchy, verdict saves, evidence deletion, pagination, Cover-status resolution, score-change finality, provincial read-only review, the grade ladder, and staff Invitations. Read the supersession column above before citing 0004 or 0006. |
| [Frontend invitation workflow](frontend-invitation-workflow.md) | Pages and endpoints the frontend needs for staff Invitations (ADR-0015). |
| [Frontend handoff, 2026-11-09](frontend-handoff-2026-11-09.md) | API changes for the frontend since the September snapshot, against `docs/api/2026-11-09/`. Follows the older [frontend handoff](frontend-handoff.md) (Thai, 26 Aug / 3 Sep 2026). |
| [MinIO to RustFS migration](minio-to-rustfs-migration.md) | Thai runbook, tested 2026-11-09, for switching production object storage to RustFS on the existing volume, with rollback. |
| [Agent workflow guides](agents/) | Issue-tracker (GitHub Issues), triage-label, and domain-document conventions used by engineering agents. |
| [API snapshot](api/) | Generated OpenAPI JSON/UI and derived API reference; useful for discovery but not authoritative for runtime authorization or status behavior. |

## Task-to-document map

| Task | Read first | Then consult |
| --- | --- | --- |
| Add or change an endpoint | [API conventions](api-conventions.md) | [Project structure](project-structure.md), [authentication](authentication-authorization.md), relevant domain guide |
| Change login, cookies, OTP, password reset, or roles | [Authentication and authorization](authentication-authorization.md) | [API conventions](api-conventions.md), [ADR-0002](adr/0002-email-otp-2fa-for-staff.md), [troubleshooting](troubleshooting.md) |
| Change enrollment, Cover, Answer, verdict, score, or grade behavior | [Business rules](business-rules.md) | [Domain model](domain-model.md), [database](database.md), [ADR-0012](adr/0012-score-changes-are-terminal.md), [ADR-0014](adr/0014-consec-gold-and-the-gold-gate.md) (grade ladder), relevant [ADRs](adr/) |
| Add or change a paginated list | [API conventions](api-conventions.md#pagination) | [ADR-0007](adr/0007-pagination-envelope-scoped-exception.md), [ADR-0009](adr/0009-offset-pagination-for-staff-lists.md), [ADR-0011](adr/0011-two-phase-read-for-computed-list-items.md), `src/schema/pagination.ts` |
| Change what a Provincial Officer can see, or any Cover read shared across reader roles | [ADR-0013](adr/0013-province-scoped-read-only-cover-review.md) | [Business rules](business-rules.md) (BR-28), [authentication](authentication-authorization.md), `src/service/evaluator-review.ts` (`getAnswers`) |
| Filter, count, or paginate on Cover status | [ADR-0010](adr/0010-lateral-latest-cover-log-resolution.md) | `src/service/coverStatus.ts`, [ADR-0008](adr/0008-exists-subquery-for-enrolled-filter.md), [database](database.md) |
| Take over the project from its previous owner | [Maintainer handover](handover.md) | The root [`README.md`](../README.md), then this index's reading order |
| Change schema, enum, relationship, or seed | [Database](database.md) | [Business rules](business-rules.md), [development](development.md), [deployment](deployment.md) |
| Change evidence upload/delete/presign behavior | [Business rules](business-rules.md) | [Authentication](authentication-authorization.md), [database](database.md), [troubleshooting](troubleshooting.md), [ADR-0012](adr/0012-score-changes-are-terminal.md) (supersedes [ADR-0006](adr/0006-delete-files-on-change-score.md)) |
| Invite staff, or change how Evaluator and Provincial Officer accounts are created | [ADR-0015](adr/0015-invitations-are-separate-from-accounts.md) | [Authentication](authentication-authorization.md), [database](database.md), [frontend invitation workflow](frontend-invitation-workflow.md), [deployment](deployment.md) |
| Change grades, award history, Prior Awards, or the enrolment lockout | [ADR-0014](adr/0014-consec-gold-and-the-gold-gate.md) | [Business rules](business-rules.md), [database](database.md) (`Awards`), `src/service/awardHistory.ts` |
| Change object storage | [MinIO to RustFS migration](minio-to-rustfs-migration.md) | [Deployment](deployment.md), [troubleshooting](troubleshooting.md) |
| Change email jobs, worker, Redis, or schedule | [Architecture](architecture.md) | [Deployment](deployment.md), [troubleshooting](troubleshooting.md), [authentication](authentication-authorization.md) |
| Run or add tests | [Testing](testing.md) | [Development](development.md), [database](database.md) |
| Change Docker, Nginx, environment, or release behavior | [Deployment](deployment.md) | [Architecture](architecture.md), [development](development.md), [troubleshooting](troubleshooting.md) |
| Diagnose an incident | [Troubleshooting](troubleshooting.md) | The affected integration/domain guide; [deployment](deployment.md) for topology |
| Plan a major refactor or remediation | [Technical debt](technical-debt.md) | [Architecture](architecture.md), [maintainer handover](handover.md), and affected domain guide |
| Create or triage work | [Issue tracker](agents/issue-tracker.md) | [Triage labels](agents/triage-labels.md), [domain guide](agents/domain.md) |

## Where to Look Before Making Changes

| Change area | Primary source paths | Required documentation |
| --- | --- | --- |
| API bootstrap, errors, logging, request limits | `src/index.ts`, `src/routes/index.ts` | [Architecture](architecture.md), [API conventions](api-conventions.md) |
| Route or DTO contract | `src/routes/**`, `src/schema/**`, `src/schema/index.ts` | [API conventions](api-conventions.md), relevant role/domain guide |
| Authentication or role enforcement | `src/service/authentication.ts`, `src/middleware/**`, `src/routes/authentication/**` | [Authentication and authorization](authentication-authorization.md), [ADR-0002](adr/0002-email-otp-2fa-for-staff.md) |
| Factory enrollment and annual scoping | `src/service/enroll.ts`, `src/service/cover.ts`, `src/utils.ts` | [Business rules](business-rules.md), [domain model](domain-model.md), [database](database.md) |
| Answers, evidence, negotiation | `src/service/answer.ts`, `src/schema/answer.ts`, `src/utils.ts` | [Business rules](business-rules.md), [ADRs 0004–0006](adr/), [ADR-0012](adr/0012-score-changes-are-terminal.md) |
| Evaluator review and finalization | `src/service/evaluator-review.ts`, `src/service/evaluator.ts`, `src/routes/evaluators/covers/**`, `src/routes/admins/covers/**` | [Business rules](business-rules.md), [authentication](authentication-authorization.md), [ADRs 0003–0006](adr/) |
| Score or grade | `src/service/scoreHelpers.ts`, `src/service/score.ts`, `src/schema/score.ts`, `src/service/awardHistory.ts`, `src/drizzle/grades.ts` | [Business rules](business-rules.md), [ADR-0001](adr/0001-score-calculated-on-demand.md), [ADR-0014](adr/0014-consec-gold-and-the-gold-gate.md) |
| Staff Invitations and the staff list | `src/service/invitation.ts`, `src/service/staff.ts`, `src/routes/admins/invitations/`, `src/routes/admins/staff/`, `src/routes/authentication/index.ts` | [ADR-0015](adr/0015-invitations-are-separate-from-accounts.md), [authentication](authentication-authorization.md), [database](database.md) |
| Factory approval and Prior Awards | `src/service/admin.ts`, `src/routes/admins/factories/` | [ADR-0014](adr/0014-consec-gold-and-the-gold-gate.md), [business rules](business-rules.md) |
| Cover status, list pagination, Factory Name Search | `src/service/coverStatus.ts`, `src/schema/pagination.ts`, `src/service/factoryNameSearch.ts`, the nine staff list routes | [API conventions](api-conventions.md#pagination), [ADRs 0007–0011](adr/) |
| Database schema or seed | `src/drizzle/schema.ts`, `src/drizzle/seed.ts`, `seed_data/`, `drizzle.config.ts` | [Database](database.md), [development](development.md), [deployment](deployment.md) |
| Object storage file access (RustFS, Compose service `minio`) | `src/utils.ts`, `src/service/file.ts`, `src/routes/file/index.ts`, `nginx/nginx.conf`, `nginx/nginx.conf.template`, `docker-compose.yaml` | [Authentication](authentication-authorization.md), [API conventions](api-conventions.md), [troubleshooting](troubleshooting.md) |
| Queue, email, or scheduler | `src/queue/email.ts`, `src/worker/email.ts`, `src/workers.ts` | [Architecture](architecture.md), [deployment](deployment.md), [troubleshooting](troubleshooting.md) |
| Tests or quality tooling | `src/**/*.test.ts`, `src/**/*.integration.test.ts`, `src/test/setup.ts`, `bunfig.toml`, `biome.json` | [Testing](testing.md), [development](development.md) |
| Containers, proxy, environment, release | `Dockerfile`, `docker-compose.yaml`, `nginx/`, `src/config.ts`, `deploy/production/`, `deploy/staging/` | [Deployment](deployment.md), [development](development.md), [troubleshooting](troubleshooting.md) |
| Cross-cutting risk or major refactor | Relevant source paths from the debt item | [Technical debt](technical-debt.md), [architecture](architecture.md), [maintainer handover](handover.md) |

## Authority and maintenance notes

- Current source/configuration is the authority for implemented behavior; these guides explain it and
  record verified conflicts.
- ADRs explain accepted design intent. If implementation conflicts with an ADR, surface the conflict
  before changing either side.
- `CONTEXT.md` was updated on 2026-08-25 alongside ADR-0012, extended through 2026-11-10 (Invitation,
  Factory Name Search, Prior Award), and re-checked on 2026-11-11. It is current for the verdict, score,
  review, and staff vocabulary. It retains superseded passages deliberately, marked as provenance — read the
  supersession notes rather than the struck-through text.
- `docs/api/openapi.json`, `docs/api/API.md`, and `docs/api/index.html` are snapshots and have known
  contract drift; `docs/api/2026-11-09/` is the dated set the 2026-11-09 frontend handoff compares
  against. Verify route, schema, middleware, and service behavior directly.
- `docs/frontend-handoff.md` and `docs/frontend-handoff-2026-11-09.md` are dated handoffs to the
  frontend team, and `docs/minio-to-rustfs-migration.md` is a dated runbook. They are not updated per
  change.
- `docs/dev-otp-bypass.html`, `docs/evaluation-flow.html`, and `docs/evaluation-features-th.html` are
  focused historical/operator references, not the primary maintained handover set.
- `docs/requirements-traceability{,-th}.md`, `docs/evaluation-traceability-summary{,-th}.md`, the
  matching `.xlsx` files, and `docs/test-report{,-th}.md` are point-in-time reports from 2026-08-20,
  useful for stakeholder review and not maintained per change.
- `.specs-fire/` and `memory-bank/` hold the intent, work-item, and per-run history behind these
  decisions. Read them when you need the reasoning a walkthrough recorded but an ADR condensed.
- When behavior changes, update the affected maintained guide and ADR where required. Verify local
  links and commands before handoff.
