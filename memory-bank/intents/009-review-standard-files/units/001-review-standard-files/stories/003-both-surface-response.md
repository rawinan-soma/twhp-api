---
id: 003-both-surface-response
unit: 001-review-standard-files
intent: 009-review-standard-files
status: complete
priority: must
created: 2026-07-03T01:54:42.000Z
assigned_bolt: 022-review-standard-files
implemented: true
---

# Story: 003-both-surface-response

# User Story

**As** a DOED admin and an evaluator (tier-1/ODPC)
**I want** the same `{ answers, standards }` response on both cover-review surfaces
**So that** standards visibility is identical regardless of which surface I use

## Acceptance Criteria

- [ ] **Given** `GET /twhp/api/evaluators/covers/:coverId/answers`, **When** wired, **Then** its OpenAPI `response[200]` uses the new `{ answers, standards }` schema and it returns the service result directly (route stays thin).
- [ ] **Given** `GET /twhp/api/admins/covers/:coverId/answers`, **When** wired, **Then** it uses the **same** response schema and returns the identical shape (admin reviews as national ODPC, region null).
- [ ] **Given** identical cover state, **When** an evaluator-ODPC and a DOED admin both read, **Then** the `standards` collection is identical (aside from region-scoped cover access).
- [ ] **Given** a tier-1 reviewer whose answers are category-filtered, **When** reading, **Then** the `standards` collection is **not** filtered by category (all claimed standards present).
- [ ] **Given** an inaccessible cover, **When** read, **Then** the existing `404` is returned on both surfaces (unchanged).

## Technical Notes

- Update the `response` map in both `covers/[coverId]/answers/index.ts` route files to the object schema from story 001.
- No business logic in routes; reviewer resolution + `assertCoverAccess` are unchanged.

## Dependencies

### Requires
- 001-standard-file-dto
- 002-standards-service-enrichment

### Enables
- 004-docs-and-test-regression

## Out of Scope

- Docs regen + tests (004).
