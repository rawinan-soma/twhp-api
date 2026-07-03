---
id: 002-standards-service-enrichment
unit: 001-review-standard-files
intent: 009-review-standard-files
status: complete
priority: must
created: 2026-07-03T01:54:42.000Z
assigned_bolt: 022-review-standard-files
implemented: true
---

# Story: 002-standards-service-enrichment

# User Story

**As** a reviewer (tier-1, ODPC, or DOED)
**I want** the cover-review read to include the factory's claimed standard certificates
**So that** I can verify declared standards during evaluation without a separate enroll fetch

## Acceptance Criteria

- [ ] **Given** `evaluatorReviewService.getAnswers(coverId, reviewer)`, **When** it returns, **Then** it returns `{ answers, standards }` (was `AnswerViewItem[]`); `answers` is the **unchanged** prior array (same projection, region + category scope, per-answer status).
- [ ] **Given** the cover, **When** standards are derived, **Then** they are read from the cover's enroll (`covers → enrolls`) using the existing `standardBoolMap`/`standardUrlMap` pairing (`answer.ts`) — no re-declared bool↔file list.
- [ ] **Given** each of the 11 standards, **When** building `standards`, **Then** an item `{ standard, fileName }` is emitted **only** where the `standard*` bool is `true` **and** the matching `fileStandard*Url` is not null (claimed + uploaded); not-claimed and claimed-without-file are omitted.
- [ ] **Given** a cover with no in-scope answers, **When** `getAnswers` early-returns, **Then** it still returns `{ answers: [], standards }` (standards are not gated on answers).
- [ ] **Given** cover access fails (`assertCoverAccess`), **When** called, **Then** the existing `404` is returned and **no** standards are leaked.
- [ ] **Given** the read, **When** executed, **Then** the enroll is fetched without an N+1 (single additional read/join alongside the existing cover access / answers query).

## Technical Notes

- `standardBoolMap`/`standardUrlMap` map each `standardTypes` key to its enroll bool column and `fileStandard*Url` column — iterate those to stay in sync with the enum.
- The service already joins `covers → enrolls` for cover access; extend that path rather than adding a separate round-trip where possible.
- Emit the stored `fileName` (the filename, not a presigned URL); the reviewer resolves it via the existing `/file/presigned-url`.

## Dependencies

### Requires
- 001-standard-file-dto

### Enables
- 003-both-surface-response
- 004-docs-and-test-regression

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Factory claims a standard but (imported) has no file | Omitted from `standards` (claimed+uploaded only) |
| Cover with zero in-scope answers | `{ answers: [], standards: [...] }` |
| Tier-1 reviewer (category-scoped answers) | Sees **all** claimed standards (factory-level, not category-scoped) |

## Out of Scope

- Route response schema wiring (003); docs/tests (004).
