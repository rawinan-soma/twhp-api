---
id: 001-reviewer-context-seam
unit: 001-admin-as-evaluator
intent: 004-admin-as-evaluator
status: complete
priority: must
created: 2026-06-19T00:00:00.000Z
assigned_bolt: 011-admin-as-evaluator
implemented: true
---

# Story: 001-reviewer-context-seam

## User Story

**As a** maintainer of the review service
**I want** `evaluatorReviewService` to operate on a resolved reviewer context
`{ accountId, level, region: number | null }` instead of always resolving an evaluator row
**So that** a national admin (ODPC, no region) can reuse the exact ODPC path without
duplicating its logic, and real evaluators keep their current behaviour

## Acceptance Criteria

- [ ] **Given** the current `getAnswers`/`verdict` methods, **When** refactored, **Then**
  they accept a resolved reviewer context `{ accountId, level, region: number | null }`
  rather than resolving `getEvaluatorData(callerId)` internally
- [ ] **Given** a non-null `region` (real evaluator), **When** a Cover is accessed, **Then**
  it is still gated by `assertCoverInRegion(coverId, region)` — **behaviour unchanged**
- [ ] **Given** `region: null` (admin), **When** a Cover is accessed, **Then** the region
  gate is skipped and a region-less `assertCoverExists(coverId)` is used instead
- [ ] **Given** a non-existent `coverId`, **When** `assertCoverExists` runs, **Then** it
  returns `404 { message: "cover not found" }`
- [ ] **Given** the refactor, **When** an evaluator calls the existing
  `/evaluators/covers/*` routes, **Then** the resolved context still comes from
  `getEvaluatorData` (level + region) and the returned data/statuses are identical to today
- [ ] **Given** the reviewer context, **When** `getAnswers`/`verdict` write logs, **Then**
  `eval_id` / `evaluatorId` come from `context.accountId` (not a hard-coded evaluator
  lookup)

## Technical Notes

- Pure seam/refactor — **no new endpoint** in this story; it enables stories 002 & 003.
- Keep `categoriesFor(level)`, the out-of-scope `403` guard, the finalize gate, backstop,
  file-deletion, transition, Grade, and email code **unchanged** — only the reviewer
  resolution + cover-existence check move behind the context.
- The evaluator routes keep calling `getEvaluatorData` and pass its result as the context.
- `assertCoverExists` mirrors `assertCoverInRegion` minus the `provinces.health_region`
  filter.

## Dependencies

### Requires
- (cross-intent) 003-evaluator-review fully implemented

### Enables
- 002-admin-answers-endpoint
- 003-admin-verdict-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Evaluator context with valid region, cover in another region | `404` (unchanged) |
| Admin context (`region: null`), cover exists in any region | Allowed |
| Admin context, cover id does not exist at all | `404 cover not found` |

## Out of Scope

- The admin routes themselves (002, 003); any change to ODPC finalize/Grade/email logic.
