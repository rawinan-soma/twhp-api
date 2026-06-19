---
id: 003-answers-list-endpoint
unit: 001-evaluator-review
intent: 003-evaluator-review
status: complete
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 007-evaluator-review
implemented: true
---

# Story: 003-answers-list-endpoint

## User Story

**As an** evaluator
**I want** to see the Cover's answers for my categories with the factory's score and any existing verdict
**So that** I can judge each answer within my remit

## Acceptance Criteria

- [ ] **Given** `GET /twhp/api/evaluators/covers/:coverId/answers`, **When** called by Mental, **Then** only `Mental` answers are returned; DOH → `Disease`+`Safety`; ODPC → all 5 (hard server-side filter)
- [ ] **Given** each returned answer, **When** serialized, **Then** it includes current `answerStatus`, question + category, factory `selectedChoice`, and the latest `verdict_choice` + `description` (if any)
- [ ] **Given** a Cover outside the caller's region, **When** requested, **Then** it is not returned (out of scope)
- [ ] **Given** a non-evaluator caller, **When** requested, **Then** `evalGuard`/404 blocks access

## Technical Notes

- Route autoloaded under `src/routes/evaluators/covers/[coverId]/answers/index.ts`, `evalGuard`
- Filter answers by `categoriesFor(level)` from story 002 via a join `answers → questions.category`
- Latest verdict = newest `answerLogs` row for the answer (event-sourced)
- TypeBox response DTO in `src/schema/`

## Dependencies

### Requires
- 002-level-category-access

### Enables
- (evaluator UI — out of scope)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Cover with no answers | Empty array |
| Answer already `finished`/`recommended` | Returned with its status (read-only context) |

## Out of Scope

- Writing verdicts (004)
