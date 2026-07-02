---
id: 001-verdict-schema-refactor
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
status: complete
priority: must
created: 2026-07-02T00:00:00.000Z
assigned_bolt: 019-per-answer-verdict-save
implemented: true
---

# Story: 001-verdict-schema-refactor

# User Story

**As** a developer
**I want** the verdict DTOs reshaped for single-Answer save + a finalize body
**So that** the per-Answer save and finalize endpoints have precise, batch-free validation

## Acceptance Criteria

- [ ] **Given** `src/schema/evaluator-review.ts`, **When** refactored, **Then** a `VerdictSaveBodySchema` (the `approve | change_score | reject` union with **no `answerId`**) + `VerdictSaveBody` type are exported as the **single-save body**
- [ ] **Given** the finalize endpoint, **When** its body is validated, **Then** a `FinalizeSchema` (empty object `{}`) exists for it
- [ ] **Given** `answerId` is a path param, **When** the save body is parsed, **Then** the body does not contain `answerId`
- [ ] **Given** the existing per-entry rules, **When** validating, **Then** `change_score` requires `verdictChoice` (`0`–`3`) + `description`, `reject` requires `description`, `approve` requires neither
- [ ] **Given** `AnswerViewItemSchema`/`AnswerViewSchema`, **When** refactoring, **Then** they are unchanged (the read path is untouched)
- [ ] **[DEFERRED → bolt 021]** `VerdictBatchSchema`/`VerdictBatch` deletion is deferred: bolts 020 (`finalize` extraction from `verdict()`) and 021 (batch-route removal + test restructure) still depend on them. Bolt 019 is **additive** — see construction-log scope-change 2026-07-02.

## Technical Notes

- Reuse the existing `ApproveEntrySchema`/`ChangeScoreEntrySchema`/`RejectEntrySchema`; only the batch wrapper and `answerId` field change.
- `answerStatus` and all Drizzle tables are unchanged — this is DTO-only, no `db:push`.

## Dependencies

### Requires
- (none — foundational)

### Enables
- 002-save-answer-verdict-service
- 004-odpc-finalize-action
- 005-save-and-finalize-routes

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Client still sends `answerId` in body | Ignored/stripped by validation; path param is authoritative |
| Client posts a batch array to the save endpoint | `400` validation error (body is a single entry, not an array) |

## Out of Scope

- Service logic (002/004), routes (005), admin surface (006).
