---
id: 004-docs-and-test-regression
unit: 001-review-standard-files
intent: 009-review-standard-files
status: complete
priority: must
created: 2026-07-03T01:54:42.000Z
assigned_bolt: 022-review-standard-files
implemented: true
---

# Story: 004-docs-and-test-regression

# User Story

**As** a maintainer
**I want** the API docs regenerated and the cover-review tests updated to the new shape
**So that** the `{ answers, standards }` response is documented and regression-safe

## Acceptance Criteria

- [ ] **Given** the routes changed (003), **When** docs are regenerated, **Then** `docs/api/openapi.json`, `docs/api/API.md`, and `docs/api/index.html` reflect the `{ answers, standards }` response on both cover-review reads.
- [ ] **Given** the cover-review integration tests, **When** updated, **Then** they assert the new shape: `answers` unchanged (region/category scope, per-answer status) and `standards` contains exactly the claimed+uploaded standards.
- [ ] **Given** the seed data has **no** standard files, **When** tests run, **Then** the fixtures **seed** enroll `standard*` bools + `fileStandard*Url` values so `standards` can be asserted (claimed+uploaded included; not-claimed and claimed-without-file excluded).
- [ ] **Given** a tier-1 reviewer, **When** tested, **Then** the test confirms all claimed standards are returned regardless of the reviewer's answer-category scope.
- [ ] **Given** the `getAnswers` regression from intent 008 (bolt 021), **When** updated, **Then** it asserts the new object shape (not the old bare array) and still confirms answers filtering/projection is unchanged.
- [ ] **Given** the full evaluator-review suite, **When** run, **Then** it passes.

## Technical Notes

- Reuse the live-Postgres integration harness (per bolts 019–021); seed standard files on the fixture enroll (mirror how the finalize suite seeds its own data).
- Docs are generated from the OpenAPI plugin — regen after routes (003) land (start app → dump `document/json` → `bun run scripts/gen-api-docs.ts`).

## Dependencies

### Requires
- 001-standard-file-dto
- 002-standards-service-enrichment
- 003-both-surface-response

### Enables
- (none — final story)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Enroll with a claimed standard but null file (seeded) | Excluded from `standards` |
| Enroll with an unclaimed standard that has a stray file | Excluded (bool false) |
| Cover with zero in-scope answers | `{ answers: [], standards: [...] }` asserted |

## Out of Scope

- Any behaviour change to answers filtering, verdict save, or finalize.
