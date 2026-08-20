---
id: 002-finalize-finished-grade-publication
unit: 001-finished-cover-reward-guard
intent: 011-finished-cover-reward-guard
status: ready
priority: must
created: 2026-07-20T04:05:27Z
assigned_bolt: 024-finished-cover-reward-guard
implemented: false
---

# Story: 002-finalize-finished-grade-publication

## User Story

**As a** Factory receiving a finalize result
**I want** a Grade published only after my Cover's finished transition commits
**So that** revision-needed or failed finalization never announces a reward

## Acceptance Criteria

- [ ] **Given** finalize resolves the Cover to `finished`, **When** its database transaction commits,
  **Then** the response contains the existing computed Grade and the finished email job contains it.
- [ ] **Given** finalize resolves the Cover to `in_progress`, **When** its transaction commits, **Then**
  the response contains `grade: null` and the revision email job contains no Grade.
- [ ] **Given** finalize is rejected or aborts before commit, **When** the request completes, **Then** no
  Grade response or result-email job is produced.
- [ ] **Given** finalize is reached through either Evaluator or Admin routes, **When** the same domain
  outcome occurs, **Then** Grade eligibility is identical because both use the shared service.

## Technical Notes

- Primary seam: shared evaluator-review finalize service and its queue stub.
- The Grade decision must follow the committed `newCoverStatus`; do not create a second independent
  status interpretation.
- Preserve job names, response schemas, queue failure handling, and Grade formula.

## Dependencies

### Requires

- None

### Enables

- 003-finished-grade-contract-regression

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| At least one Answer is rejected | Cover transitions to in-progress; null/no Grade |
| All observed Answers resolve without rejection | Cover transitions to finished; existing Grade returned |
| Queue enqueue fails after finished commit | Existing behavior remains: finalize succeeds; queue error is swallowed/logged |

## Out of Scope

- Changing finalize completeness, authorization, idempotency, or concurrency behavior.
- Changing email copy, delivery guarantees, or retry policy.
