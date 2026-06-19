---
id: 004-verdict-batch-endpoint
unit: 001-evaluator-review
intent: 003-evaluator-review
status: complete
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 007-evaluator-review
implemented: true
---

# Story: 004-verdict-batch-endpoint

## User Story

**As an** evaluator
**I want** to submit one atomic batch of verdicts over the answers I may act on
**So that** my review is recorded all-or-nothing with the correct status per outcome

## Acceptance Criteria

- [ ] **Given** `POST /twhp/api/evaluators/covers/:coverId/verdict` with `{ answerId, decision: approve|change_score|reject, verdictChoice?, description? }[]`, **When** any entry targets an answer outside the caller's categories, **Then** the **whole batch is rejected `403`** (no partial application)
- [ ] **Given** a `change_score` entry, **When** validated, **Then** it requires `verdictChoice` ∈ `{0,1,2,3}` + non-empty `description` (else `400`)
- [ ] **Given** a `reject` entry, **When** validated, **Then** it requires `description` (else `400`); `approve` requires neither
- [ ] **Given** a valid batch, **When** committed, **Then** all `answerLogs` rows are written in **one transaction** (no partial/per-answer save), with `eval_id` set
- [ ] **Given** a tier-1 caller, **When** `approve`, **Then** the answer becomes `recommended`; **Given** an ODPC caller, **When** `approve`, **Then** `finished` (finalize rules in story 005)
- [ ] **Given** `change_score`/`reject`, **When** committed, **Then** the answer becomes `rejected` with/without `verdict_choice` respectively
- [ ] **Given** an entry targeting an answer not currently actionable (e.g. already `finished`), **When** submitted, **Then** it is rejected per the override rule

## Technical Notes

- New `evaluatorReviewService.verdict(coverId, callerId, batch)`; routes call it and return `status(...)`
- Validate scope using `categoriesFor(level)` (story 002) before opening the txn
- File deletes for hard-rejects are handled in story 006 (ODPC finalize), not here
- TypeBox request DTO with a discriminated union on `decision`

## Dependencies

### Requires
- 001-schema-changes
- 002-level-category-access

### Enables
- 005-finalize-and-transition

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Empty batch | `400` (nothing to do) or no-op — define as `400` |
| Duplicate answerId in batch | `400` (ambiguous) |
| change_score with verdictChoice = factory's current | Allowed (still a recorded proposal) |

## Out of Scope

- Finalize/override/transition (005), file deletion (006)
