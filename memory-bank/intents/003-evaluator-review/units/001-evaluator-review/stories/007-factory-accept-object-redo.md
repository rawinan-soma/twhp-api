---
id: 007-factory-accept-object-redo
unit: 001-evaluator-review
intent: 003-evaluator-review
status: draft
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 009-evaluator-review
implemented: false
---

# Story: 007-factory-accept-object-redo

## User Story

**As a** factory
**I want** to accept a verdict score, object with new evidence, or redo a rejected answer
**So that** I can resolve each send-back during the negotiation

## Acceptance Criteria

- [ ] **Given** a change-score answer (`verdict_choice` set), **When** the factory **accepts**, **Then** the answer → `recommended`, the Verdict Score becomes the live choice, and the **same per-choice file validator** applies (a downgrade passes on existing files; an upward accept without supporting files is rejected → must object instead)
- [ ] **Given** a change-score answer, **When** the factory **objects**, **Then** it re-answers with a (possibly equal) `selectedChoice`, freely managing files (append / replace / delete when lowering score), validated against the new choice's file requirements, reconciling MinIO before the txn → answer `in_review`
- [ ] **Given** a hard-rejected answer (`verdict_choice` null), **When** the factory **redoes** it, **Then** it re-answers + re-uploads evidence → `in_review`
- [ ] **Given** a `recommended` or `finished` answer, **When** the factory targets it, **Then** the action is rejected (locked)
- [ ] **Given** any factory action, **When** applied, **Then** it follows the existing answer-edit pattern (file I/O outside the txn)

## Technical Notes

- Implement via the existing factory answer endpoints/service (edit path), extended with accept semantics
- Accept writes an `answerLogs` row (status `recommended`, live = `verdict_choice`); object/redo write `in_review` with the new `selectedChoice`
- Reuse the per-choice file validator from `src/service/answer.ts` (choice 1/2/3 file requirements; `special===3` variant)

## Dependencies

### Requires
- 001-schema-changes
- 006-file-deletion-on-reject

### Enables
- 008-resubmit-gate

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Accept an upward verdict with no files | Rejected by validator → factory must object |
| Object lowering 3→1 | Allowed to delete level-2/3 files |
| Cover not `in_progress` | Reject (factory acts only on a bounced Cover) |

## Out of Scope

- Re-submitting the whole Cover (008)
