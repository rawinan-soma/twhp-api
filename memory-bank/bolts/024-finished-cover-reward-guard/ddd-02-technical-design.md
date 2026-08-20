---
unit: 001-finished-cover-reward-guard
bolt: 024-finished-cover-reward-guard
stage: design
status: complete
updated: 2026-07-20T04:19:28Z
---

# Technical Design - Finished-Cover Reward Guard

## Architecture Pattern

Retain the existing **layered, domain-organized monolith** and existing service factory/singleton
boundaries. This bolt adds no module, controller layer, route, table, queue, or deployment unit.

The finished-only Grade rule is implemented as a projection invariant at two existing application
service seams:

1. **Score Report projection**: resolve current Cover status, calculate numerical scoring under
   existing availability rules, and calculate Grade only when status is `finished`.
2. **Finalize result publication**: commit the selected CoverLog transition, then calculate/publish
   Grade only when the committed status is `finished`.

Construction begins with regression tests. If every new test already passes, no production-code
change is required. If a violating path is found, apply the smallest local correction at its existing
service seam; do not introduce a new abstraction merely to create a change.

## Layer Structure

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation                                                 │
│ Existing Factory/Evaluator/Provincial/Admin score routes     │
│ Existing Evaluator/Admin finalize routes and TypeBox schemas │
├──────────────────────────────────────────────────────────────┤
│ Application / Service                                       │
│ Score Report projector        Finalize result publisher      │
│ - latest status               - choose transition            │
│ - numerical scoring           - commit transaction           │
│ - finished-only Grade         - finished-only Grade/email     │
├──────────────────────────────────────────────────────────────┤
│ Domain                                                       │
│ Latest-log-wins status · Grade eligibility iff finished      │
│ Existing scoring and Grade formulas unchanged                │
├──────────────────────────────────────────────────────────────┤
│ Infrastructure                                               │
│ Drizzle/PostgreSQL CoverLogs + scoring inputs                │
│ Existing BullMQ email queue                                  │
└──────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | Change policy |
|-------|----------------|---------------|
| Routes | Preserve guards, paths, status declarations, and direct service return | No change expected |
| Schemas | Preserve nullable Grade in Score Report/finalize responses | No change expected |
| Score service | Resolve greatest-ID CoverLog and conditionally calculate Grade | Test first; correct only if violated |
| Evaluator-review service | Publish Grade only after committed finished transition | Test first; correct only if violated |
| Grade helper | Preserve existing thresholds and calculation | No change |
| Database/queue | Preserve schema, queries' authority order, job names, and delivery semantics | No change |

## Grade Eligibility Contract

Define the design predicate conceptually as:

```text
isGradeEligible(currentCoverStatus) = currentCoverStatus === "finished"

gradeFor(status, scoringInputs) =
  status === "finished" ? existingComputeGrade(scoringInputs) : null
```

This notation documents one invariant; it does not require a new exported helper. Existing inline
conditions are acceptable when tests prove they are consistent.

## Current-Status Resolution

### Single Cover

1. Select CoverLogs for the target Cover.
2. Order by `CoverLogs.id DESC`.
3. Take one row.
4. Preserve the existing `in_progress` fallback when no row exists.

### Cover List

1. Select one CoverLog per Cover ID.
2. Partition/distinct by Cover ID.
3. Within each Cover, select greatest `CoverLogs.id`.
4. Include only `in_review` and `finished` under existing list behavior.
5. Assign `grade: null` to `in_review`; calculate Grade for `finished`.

Timestamps are not status-order inputs.

## API Design

No API contract changes are introduced.

| Endpoint surface | Method | Request | Existing response preserved |
|------------------|--------|---------|-----------------------------|
| Factory assessment score | GET | Existing authenticated request | `in_progress` → existing 400; `in_review` → Score Report with null Grade; `finished` → Score Report with Grade |
| Evaluator regional scores | GET | Existing authenticated request | Existing list; in-progress omitted, in-review null Grade, finished Grade |
| Provincial province scores | GET | Existing authenticated request | Existing list; in-progress omitted, in-review null Grade, finished Grade |
| Admin scores and filters | GET | Existing authenticated request and filters | Existing list/filter contract with identical Grade gating |
| Evaluator Cover finalize | POST | Existing Cover ID and empty body | Finished response has Grade; revision response has null Grade |
| Admin Cover finalize | POST | Existing Cover ID and empty body | Same shared-service result as Evaluator surface |

### Response Contract

- `ScoreReport.grade` remains nullable under its existing schema.
- Finalize response `grade` remains nullable under its existing schema.
- No non-Grade response property changes.
- No new error response or status code is introduced.

## Finalize Sequencing

```text
Authorize reviewer and Cover scope
        │
Read persisted latest Answer states
        │
Reject unresolved finalize / abort on pre-commit failure
        │
Choose newCoverStatus
  ├─ any rejected → in_progress
  └─ none rejected → finished
        │
Commit CoverLog transition and related DB writes
        │ success only
        ▼
if committed status == finished
  calculate existing Grade
  return Grade
  enqueue finished job with Grade
else
  do not calculate Grade
  return grade: null
  enqueue revision job without Grade
```

The status selected for the committed CoverLog, response, and notification must be one value shared
through the remainder of the operation. Do not re-query or independently reinterpret eligibility
after commit.

## Data Persistence

No migration, seed change, or stored Grade is permitted.

| Table/read model | Relevant data | Design use |
|------------------|---------------|------------|
| Covers | Cover identity and Enrollment relation | Existing report/finalize lookup |
| CoverLogs | Serial ID, Cover ID, status | Authoritative current status; greatest ID wins |
| Answers | Cover ID, current selected choice | Existing score/Grade input |
| Questions | Category and special metadata | Existing breakdown and Grade-gate input |
| Enrollments/Factories/Provinces | Ownership and scope projection data | Existing role-scoped reports and contact selection |

## Security Design

| Concern | Approach |
|---------|----------|
| Authentication | Preserve existing HTTP-only cookie JWT flow |
| Authorization | Preserve existing Factory, Evaluator, Provincial, and Admin guards plus service scoping |
| Finalize authority | Preserve ODPC/Admin-as-ODPC restriction; Factory cannot finalize |
| Scope isolation | Preserve Factory ownership and regional/provincial/national list scope |
| Information disclosure | Non-finished Grade is always null/absent under existing response behavior |
| Sensitive data | Tests and logs must not expose credentials, tokens, OTPs, or full presigned URLs |

## NFR Implementation

| Requirement | Design approach |
|-------------|-----------------|
| Cross-surface consistency | One status predicate (`finished`) asserted across single/list/finalize test matrices |
| Non-finished reward suppression | Negative assertions require `grade === null` or absent in revision job payload |
| Compatibility | Snapshot/shape assertions preserve endpoints, nullable fields, statuses, and non-Grade data |
| Performance | Reuse existing single and batched latest-log queries; add no query or persisted projection |
| Reliability | Finalize publishes reward only after successful commit; preserve queue-failure behavior |
| Auditability | Continue deriving state by greatest CoverLog ID; tests cover conflicting older/newer logs |

## Error Handling

All existing errors remain unchanged.

| Scenario | Existing behavior to preserve | Grade behavior |
|----------|-------------------------------|----------------|
| Factory has no current Cover | Existing not-found response | No Grade |
| Factory Cover is `in_progress` | Existing 400 not-ready response | No Grade |
| Finalize has unresolved Answers | Existing 400 | No Grade and no result job |
| Finalizer lacks authority/scope | Existing 403/404 | No Grade |
| Pre-commit external failure | Existing failure response | No Grade and no result job |
| Database transaction failure | Existing unexpected-error handling | No successful Grade response/job |
| Queue failure after commit | Existing logged/swallowed queue failure; API success preserved | Finished API result may retain Grade because CoverLog already committed |

## External Dependencies

| Service | Purpose | Integration behavior |
|---------|---------|----------------------|
| PostgreSQL | Current Cover status and scoring inputs | Existing Drizzle queries/transaction; no schema change |
| BullMQ/Redis | Finalize result job publication | Existing finished job with Grade or revision job without Grade |
| SMTP worker | Deliver selected result notification | No transport/template change |

## Test Design

### Test-First Feedback Loop

1. Add assertions that demonstrate the exact finished-only contract at the closest existing seams.
2. Run focused isolated tests first.
3. Run database integration tests only after `DATABASE_URL` is explicitly confirmed as disposable,
   migrated, and seeded.
4. If a new assertion fails, apply the smallest service correction and re-run the original matrix.
5. If all assertions pass against current production code, retain the regression tests and make no
   production-code change.

### Coverage Matrix

| Seam | Cases |
|------|-------|
| Score Report schema/pure fixtures | In-review null Grade; finished valid Grade; nullable field accepted |
| Factory score service | No Cover; in-progress 400; in-review null Grade; finished Grade |
| Shared staff list builder | In-progress omitted; in-review null Grade; finished Grade |
| Latest-log ordering | Older finished/newer in-review; older in-review/newer finished; ID beats timestamp |
| Shared finalize service | Finished response/job with Grade; revision response/job without Grade; abort produces no job |
| Surface parity | Evaluator and Admin routes use identical shared outcomes |

### Anticipated Test Locations

- Existing isolated score/service schema test file for response-shape assertions.
- Existing score integration test file for current status and role-list matrices.
- Existing evaluator-review finalize integration test file for response/job behavior.

Exact file edits are chosen during Stage 4 after source inspection. Do not create a parallel test
architecture or duplicate service implementation.

### Safe Validation Commands

```text
bun test src/service/score.test.ts
```

Database-backed tests are intentionally not listed as unconditional commands. They may run only
after the repository's disposable-database precondition is confirmed. Bare `bun test` and the
placeholder `bun run test` are prohibited for this bolt.

After focused tests, use the non-mutating Biome check and report baseline versus introduced
diagnostics; do not use write-mode format/lint/check scripts.

## Story-to-Design Traceability

| Story | Design components | Verification |
|-------|-------------------|--------------|
| 001-score-report-finished-grade-guard | Current-status resolution, Grade predicate, score/list API matrix | Score Report schema/service/integration matrix and conflicting-log cases |
| 002-finalize-finished-grade-publication | Commit-before-publication sequence, shared result status, queue payload selection | Finished/revision/abort finalize tests with queue stub |
| 003-finished-grade-contract-regression | Compatibility constraints, all role surfaces, validation strategy | Cross-surface assertions, schema checks, safe command report |

## Expected Change Set

### Always Expected

- Focused regression tests protecting the finished-only Grade contract.
- Bolt test-report and construction tracking artifacts.

### Conditional Only on a Failing Regression

- A minimal correction in the existing score-report or evaluator-review service condition.

### Explicitly Forbidden

- New route/controller/module hierarchy.
- Database schema, migration, seed, or persisted Grade.
- Endpoint/OpenAPI contract change.
- Grade formula or workflow transition change.
- Completeness/finalization policy change.

## ADR Assessment Preview

No new architectural decision is expected. The design applies accepted ADR-0001, ADR-0004,
ADR-0005, Admin-as-ODPC parity, and the existing latest-log-wins convention without choosing a new
storage, API, lifecycle, concurrency, or integration model. Stage 3 should record “no ADR needed”
unless Stage 2 review changes the scope.
