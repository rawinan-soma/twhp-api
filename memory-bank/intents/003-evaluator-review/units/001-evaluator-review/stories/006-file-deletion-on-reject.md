---
id: 006-file-deletion-on-reject
unit: 001-evaluator-review
intent: 003-evaluator-review
status: draft
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 008-evaluator-review
implemented: false
---

# Story: 006-file-deletion-on-reject

## User Story

**As** the system
**I want** to delete evidence files for hard-rejected answers at ODPC commit
**So that** invalid evidence is purged while preserving files for change-score disputes

## Acceptance Criteria

- [ ] **Given** an answer hard-rejected (`verdict_choice` null) in ODPC's batch, **When** ODPC commits, **Then** all its non-null `fileUrl*` files are deleted from MinIO
- [ ] **Given** a change-score answer, **When** ODPC commits, **Then** its files are **preserved** (factory needs them to object)
- [ ] **Given** the file deletes, **When** executed, **Then** they run **outside** the DB transaction (before it), per the project file-I/O pattern
- [ ] **Given** a tier-1 reject recorded earlier, **When** the Cover is still `in_review`, **Then** no files are deleted yet (deferred to ODPC commit)
- [ ] **Given** deletion completes, **When** the txn writes, **Then** the answer row's file URLs are cleared consistent with the redo flow

## Technical Notes

- Use `utilities().deleteFile(url)` per file; collect all hard-rejected answers' URLs first
- Mirror the existing answer-service ordering: file I/O → then DB transaction
- Only ODPC commit triggers deletion (tier-1 rejects are recommendations until then)

## Dependencies

### Requires
- 005-finalize-and-transition

### Enables
- 007-factory-accept-object-redo (redo re-uploads fresh)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| MinIO delete fails mid-way | Surface error before committing the txn; do not partially transition |
| Answer had no files | No-op |

## Out of Scope

- Factory-side file management (007)
