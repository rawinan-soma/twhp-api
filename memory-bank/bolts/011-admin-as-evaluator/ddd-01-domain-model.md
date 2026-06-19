---
stage: model
bolt: 011-admin-as-evaluator
created: 2026-06-19T01:40:07Z
---

## Static Model: admin-as-evaluator (seam + admin answers read)

Scope of THIS bolt: stories `001-reviewer-context-seam` + `002-admin-answers-endpoint`.
The verdict/finalize write path is bolt 012 — modelled here only insofar as the seam must
carry it.

### Entities

- **Reviewer** (conceptual, not a table): the actor performing a review. Today it is always
  an `Evaluator` row (level + region). This bolt generalizes it so a **DOED admin** can be
  a Reviewer too. Properties: `accountId`, `level`, `region`.
  - Business rule: an Evaluator-backed Reviewer has a concrete `region` (number); an
    admin-backed Reviewer has `region = null` (national) and `level = ODPC`.
- **Cover** (existing): the unit of review. Owns Answers; lives in a province whose
  `health_region` defines the Reviewer-region match. Unchanged.
- **Answer** / **AnswerLog** (existing): the reviewed items + their event-sourced status.
  Read-only in this bolt (no verdict writes here). Unchanged.

### Value Objects

- **ReviewerContext**: `{ accountId: number, level: EvaluatorLevel, region: number | null }`.
  Immutable, equality by value. The single shape both the evaluator and admin entry points
  resolve into and hand to the review service.
  - Constraint: `level ∈ {Mental, DOH, ODPC}`; `region` is `null` **iff** the caller is a
    national admin.
- **CategoryScope**: derived from `level` via `categoriesFor(level)` (existing constant).
  `ODPC → {Collaborate, Disease, Safety, Mental, Outcome}` (all 5). Unchanged.

### Aggregates

- **Cover** (aggregate root, existing): members = Answers + AnswerLogs + CoverLogs.
  This bolt only **reads** through it (answers list). Invariants unchanged.

### Domain Events

- _None new._ The read path emits no events. (Verdict/commit events are bolt 012.)

### Domain Services

- **ReviewerResolution** (new seam): maps a caller identity to a `ReviewerContext`.
  - `resolveEvaluator(callerId) → ReviewerContext | NotFound(404 "invalid evaluator")`
    (wraps existing `getEvaluatorData`; Evaluator → `{accountId, level, region}`).
  - `adminReviewerContext(accountId) → ReviewerContext` = `{accountId, level: ODPC, region: null}`
    (pure; an admin is always a national ODPC).
- **CoverAccess** (generalized): given a `ReviewerContext` + `coverId`, assert access:
  - `region === null` → `assertCoverExists(coverId)` (region-less existence; `404` if absent).
  - `region !== null` → `assertCoverInRegion(coverId, region)` (existing; `404` if not in region).
- **AnswerListing** (generalized): `getAnswers(coverId, reviewer)` — category-filtered by
  `categoriesFor(reviewer.level)`; behaviour identical to today for evaluators, and returns
  all 5 categories for an admin.

### Repository Interfaces

- Reuses existing Drizzle access: `covers`, `answers`, `questions`, `answerLogs`,
  `provinces`, `enrolls`, `factories`. No new repository. New read: region-less cover
  existence (`select covers.id where covers.id = ?`).

### Ubiquitous Language

- **Reviewer**: any actor authorized to review a Cover's Answers — an Evaluator or a DOED
  admin acting as ODPC.
- **ReviewerContext**: the resolved `{accountId, level, region|null}` the review service
  operates on, decoupled from how the caller was authenticated.
- **National (admin) context**: `region = null` — bypasses the region gate; reaches Covers
  in any `health_region`.
- **Seam**: the refactor that moves reviewer resolution + cover-access selection out of the
  service body and behind `ReviewerContext`, so a new caller type needs no new review logic.

### Story coverage

- **001-reviewer-context-seam**: ReviewerContext VO; ReviewerResolution + CoverAccess
  domain services; behaviour-preserving for the Evaluator path.
- **002-admin-answers-endpoint**: AnswerListing via an admin `ReviewerContext` exposed at a
  new presentation entry (`GET /admin/covers/:coverId/answers`).
