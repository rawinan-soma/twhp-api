---
unit: 001-finished-cover-reward-guard
bolt: 024-finished-cover-reward-guard
stage: model
status: complete
updated: 2026-07-20T04:16:03Z
---

# Static Model - Finished-Cover Reward Guard

## Bounded Context

This unit belongs to the existing **Assessment Review and Reward Publication** bounded context. It
does not introduce a new assessment lifecycle or reward subsystem. It formalizes one publication
policy over the existing Cover aggregate:

> A Grade reward may be calculated and disclosed only when the Cover's current status is
> `finished`, where current status is the CoverLog with the greatest serial ID.

The policy applies consistently to Score Report reads, finalize responses, and finalize-result email
payloads. Numerical scoring remains a separate on-demand read that is allowed for both `in_review`
and `finished` Covers. The Factory is an actor; `finished` is a state of the Factory's Cover, not a
state of the Factory account.

## Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| Factory | `accountId`, identity and scope | Owns annual assessment data but cannot directly set a Cover to `finished` |
| Cover | `coverId`, `enrollId`, CoverLog history, Answer collection | Assessment and reward boundary; its current status controls Grade eligibility |
| CoverLog | `id`, `coverId`, `status`, actor, timestamp | Append-only state event; greatest serial `id` wins and timestamp is informational |
| Answer | `answerId`, `coverId`, `questionId`, live selected choice | Provides current scoring input; this intent does not alter choice semantics |
| Question | `questionId`, category, special metadata | Provides category and existing Grade-gate metadata; rules remain unchanged |
| ScoreReport | Factory/Cover identity, `coverStatus`, numerical breakdown, nullable Grade | May expose numerical scoring for `in_review` or `finished`; exposes non-null Grade only for `finished` |
| FinalizeResult | committed Cover status, nullable Grade | Contains Grade only when the committed transition is `finished`; revision result contains null Grade |
| ResultNotification | outcome type, Factory contact, optional Grade | Finished notification contains Grade; revision notification contains no Grade |

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| CoverStatus | `in_progress`, `in_review`, or `finished` | Exactly one current value is derived from latest CoverLog; no-log fallback remains `in_progress` |
| CurrentCoverStatus | `coverId`, winning `coverLogId`, `status` | Winning log is selected by greatest serial ID, never timestamp |
| GradeEligibility | eligible/ineligible plus current status | Eligible if and only if current status equals `finished` |
| Grade | `gold`, `silver`, `certificate`, or `joined` | Derived on demand using existing thresholds; never persisted |
| ScoringBreakdown | total plus five category groups | Existing on-demand numerical result; unchanged by this unit |
| RewardPublication | target surface, current status, optional Grade | Non-null Grade is valid only when status is `finished` |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| Cover | CoverLogs, Answers, related Questions as scoring references | Current status is greatest-ID CoverLog; non-null Grade implies current status `finished`; Factory cannot directly finalize; Grade is derived, not stored |

The Score Report and finalize response are projections of the Cover aggregate. They are not new
aggregate roots and do not own independent status or Grade state.

## Aggregate Invariants

1. **Latest-log-wins**: For a Cover with logs, the greatest `CoverLog.id` is authoritative even when
   timestamps appear out of order.
2. **No-log fallback**: A Cover with no CoverLog preserves existing `in_progress` behavior and is not
   Grade-eligible.
3. **Finished-only reward**: `grade != null` implies `currentCoverStatus == finished` on every output
   surface.
4. **On-demand derivation**: Grade is calculated from current scoring inputs only for an eligible
   Cover and is never persisted as Cover state.
5. **Score/reward separation**: An `in_review` Cover may expose numerical scoring but must expose
   `grade: null`.
6. **Commit-before-publication**: A finalize Grade may be returned or queued only after the finished
   CoverLog transition commits successfully.
7. **Revision suppression**: An `in_progress` finalize result returns null Grade and queues a revision
   notification without Grade.
8. **Surface parity**: Factory, Evaluator, Provincial, Admin, evaluator-finalize, and Admin-finalize
   surfaces interpret eligibility identically.
9. **Compatibility**: The policy does not change endpoints, authorization, score formula, Grade
   thresholds, response shapes, or workflow transitions.

## State and Reward Matrix

| Current Cover status | Factory score endpoint | Staff score lists | Numerical score | Grade reward |
|----------------------|------------------------|-------------------|-----------------|--------------|
| `in_progress` | Existing `400` | Existing omission | Existing behavior unchanged | Never returned |
| `in_review` | Existing success | Included | Returned | `null` |
| `finished` | Existing success | Included | Returned | Existing calculated Grade |

## Domain Events

These are conceptual domain events used to describe ordering; this intent does not require a new
event store, table, or message type.

| Event | Trigger | Payload |
|-------|---------|---------|
| CoverStatusCommitted | A CoverLog transition commits | `coverId`, winning `coverLogId`, new status, actor |
| FinishedRewardBecameEligible | `CoverStatusCommitted.status` is `finished` | `coverId`, calculated Grade inputs/reference |
| CoverReturnedForRevision | `CoverStatusCommitted.status` is `in_progress` after finalize | `coverId`; explicitly no Grade |
| ScoreReportProjected | An authorized score-report read succeeds | `coverId`, current status, scoring, nullable Grade |
| ResultNotificationRequested | Finalize commit selects notification outcome | Finished payload with Grade or revision payload without Grade |

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| CurrentCoverStatusResolver | Resolve greatest-ID CoverLog; apply no-log fallback | CoverLog repository/read model |
| GradeEligibilityPolicy | Decide whether Grade may be calculated/disclosed | CurrentCoverStatusResolver |
| GradeCalculator | Apply existing Grade formula to current scoring inputs | Existing scoring breakdown and Answer/Question inputs |
| ScoreReportProjector | Build single/list reports with numerical scoring and conditional Grade | Status resolver, eligibility policy, Grade calculator |
| FinalizeRewardPublisher | After commit, build finalize result and select notification payload | Committed status, eligibility policy, Grade calculator, notification port |

These names describe domain responsibilities, not mandatory new source modules. Construction should
reuse existing service boundaries and introduce no abstraction unless a failing test shows one is
needed.

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| CoverStatusRepository | CoverLog | `findLatestByCoverId(coverId)`, `findLatestByCoverIds(coverIds)` ordered by greatest serial ID |
| ScoringInputRepository | Answer/Question | `findScoringInputsByCoverId(coverId)`, `findScoringInputsByCoverIds(coverIds)` |
| CoverReportRepository | Cover/Factory/Enrollment | Find the existing single or scoped list projection inputs |
| CoverTransitionRepository | CoverLog | Commit the existing finalize transition atomically with related database writes |
| ResultNotificationPort | ResultNotification | Enqueue finished notification with Grade or revision notification without Grade |

These are conceptual interfaces over existing persistence/integration responsibilities. No database
schema or deployment boundary is implied.

## Policy Truth Table

| Latest CoverLog | Grade calculation allowed | API `grade` | Finished email Grade | Revision email Grade |
|-----------------|---------------------------|-------------|----------------------|----------------------|
| none / fallback `in_progress` | No | None under existing unavailable/omitted behavior | Not applicable | Not applicable |
| `in_progress` | No | `null` where finalize response exists | Not sent | Absent |
| `in_review` | No | `null` | Not sent | Not sent |
| `finished` | Yes | Existing Grade | Present | Not sent |

## Story Traceability

| Story | Domain model coverage |
|-------|-----------------------|
| 001-score-report-finished-grade-guard | CurrentCoverStatus, GradeEligibility, ScoreReport, latest-log invariant, state/reward matrix |
| 002-finalize-finished-grade-publication | FinalizeResult, commit-before-publication, ResultNotification, finalize domain events |
| 003-finished-grade-contract-regression | Surface parity, compatibility invariant, policy truth table, repository/service contracts |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| Factory | Authenticated organization actor; it owns assessment data but does not have a `finished` account state |
| Factory's Cover | The annual assessment belonging to a Factory; this entity can become `finished` |
| CoverLog | Append-only Cover status event; current state is the row with greatest serial ID |
| Current Cover status | Status from the greatest-ID CoverLog, or existing `in_progress` fallback if no log exists |
| Finished | Cover status written through authorized finalization; the only Grade-eligible status |
| Numerical score | On-demand assessment percentages available under existing rules for `in_review` and `finished` |
| Grade / Reward | On-demand tier (`gold`, `silver`, `certificate`, `joined`) disclosed only for a finished Cover |
| Grade eligibility | Boolean policy: current Cover status is exactly `finished` |
| Score Report | Existing read model containing Cover identity, current status, scoring, and nullable Grade |
| Finalize | Authorized whole-Cover operation that commits a status transition before result publication |
| Result publication | Returning a finalize response and requesting the corresponding result email job |
| Surface parity | The same Grade eligibility rule across every role-facing report and both finalize routes |

## Explicit Non-Goals

- This model does not define whether a Cover is complete enough to become `finished`.
- It does not repair or reinterpret an already committed `finished` CoverLog.
- It does not change live-choice provenance, score calculation, Grade thresholds, or special gates.
- It does not add a reward table, cached Grade, endpoint, event bus, or new email job.
