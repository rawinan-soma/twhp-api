---
id: 001-standard-file-dto
unit: 001-review-standard-files
intent: 009-review-standard-files
status: complete
priority: must
created: 2026-07-03T01:54:42.000Z
assigned_bolt: 022-review-standard-files
implemented: true
---

# Story: 001-standard-file-dto

# User Story

**As** a frontend consumer of the cover-review read
**I want** a typed `{ answers, standards }` response with a `StandardFileItem` shape
**So that** I can render the factory's standard certificates alongside the answers

## Acceptance Criteria

- [ ] **Given** `src/schema/evaluator-review.ts`, **When** the DTO lands, **Then** a `StandardFileItemSchema` exists = `t.Object({ standard: <standardTypes literal union>, fileName: t.String() })`.
- [ ] **Given** the `standard` field, **When** typed, **Then** it is the `standardTypes` enum key set (11 values: `standardHC`…`standardHAS`), not a free string and not a display label.
- [ ] **Given** the cover-review response schema, **When** changed, **Then** `AnswerViewSchema` becomes `t.Object({ answers: t.Array(AnswerViewItemSchema), standards: t.Array(StandardFileItemSchema) })` (the former bare array is moved under `answers`).
- [ ] **Given** `AnswerViewItemSchema`, **When** the shape changes, **Then** the per-answer item fields are **unchanged** (only the wrapping changes).
- [ ] **Given** the new schemas, **When** exported, **Then** they are consumable by both cover-review routes (evaluators + admins).

## Technical Notes

- Reuse the `standardTypes` pgEnum values for the `standard` literal union — do not hand-list a divergent set.
- Keep `AnswerViewItemSchema` intact; only introduce the `{ answers, standards }` wrapper.

## Dependencies

### Requires
- (none — DTO only)

### Enables
- 002-standards-service-enrichment
- 003-both-surface-response

## Out of Scope

- Service logic (002); route wiring (003); docs/tests (004).
