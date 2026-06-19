---
id: 002-level-category-access
unit: 001-evaluator-review
intent: 003-evaluator-review
status: complete
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 006-evaluator-review
implemented: true
---

# Story: 002-level-category-access

## User Story

**As a** review service
**I want** a single source of truth for which categories each evaluator level owns
**So that** both read and write endpoints enforce the same access scope server-side

## Acceptance Criteria

- [ ] **Given** a level→category constant, **When** defined, **Then** `Mental → {Mental}`, `DOH → {Disease, Safety}`, `ODPC → {Collaborate, Disease, Safety, Mental, Outcome}` (all 5)
- [ ] **Given** a caller account id, **When** the service resolves the evaluator, **Then** `getEvaluatorData` yields `level` + `region` and a 404 for non-evaluators
- [ ] **Given** a coverId, **When** accessed, **Then** the Cover is confirmed to belong to the caller's `region` (else not visible)
- [ ] **Given** a helper `categoriesFor(level)`, **When** called, **Then** it returns the owned set used by both endpoints

## Technical Notes

- Reuse `evaluatorService.helper.getEvaluatorData` (returns the full `evaluators` row incl. `level`, `region`)
- Define the map as a typed constant keyed by `evaluatorLevels` enum; source values from CONTEXT.md (single canonical spot)
- Region scoping mirrors existing evaluator endpoints (`enrolls`/`factories`/`score`)

## Dependencies

### Requires
- None

### Enables
- 003-answers-list-endpoint
- 004-verdict-batch-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Evaluator with no `region` | Treat as no visible Covers |
| Cover outside caller region | 403/404 (not found in scope) |

## Out of Scope

- The endpoints themselves (003, 004)
