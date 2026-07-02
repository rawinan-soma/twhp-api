---
id: 006-admin-surface-parity
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
status: draft
priority: must
created: 2026-07-02T00:00:00Z
assigned_bolt: 021-per-answer-verdict-save
implemented: false
---

# Story: 006-admin-surface-parity

# User Story

**As** a DOED admin reviewing as national ODPC
**I want** the same per-Answer save and finalize on the admin surface
**So that** admin review behaves identically to an ODPC evaluator, region-wide

## Acceptance Criteria

- [ ] **Given** the admin surface, **When** routes are wired, **Then** `POST /twhp/api/admins/covers/:coverId/answers/:answerId/verdict` and `POST /twhp/api/admins/covers/:coverId/finalize` exist and call the **same** `saveAnswerVerdict`/`finalize` service
- [ ] **Given** an admin caller, **When** the reviewer is resolved, **Then** it uses `adminReviewerContext` (level `ODPC`, `region: null`) so cover access is existence-only (national)
- [ ] **Given** the admin acts as ODPC, **When** saving, **Then** approve → `recommended` and finalize is permitted (admin = ODPC authority)
- [ ] **Given** the old admin batch routes, **When** the refactor lands, **Then** they are removed (consistent with the in-flight `admins/covers` migration)
- [ ] **Given** identical inputs, **When** an evaluator-ODPC and an admin act, **Then** the persisted `answerLogs`/`coverLogs` outcomes are identical (aside from region scoping)

## Technical Notes

- Mirror the evaluator route files under `src/routes/admins/covers/[coverId]/…`; guard with the admin guard; resolve via `adminReviewerContext(accountId)`.
- No duplicated business logic — both surfaces call the one `evaluatorReviewService`.

## Dependencies

### Requires
- 005-save-and-finalize-routes

### Enables
- 007-answers-list-and-docs-regression

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Admin finalizes a cover in any region | Allowed (region null → existence-only) |
| Admin save on any category | Allowed (ODPC = all 5) |

## Out of Scope

- Docs regen + test restructure (007).
