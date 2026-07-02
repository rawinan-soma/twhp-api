---
id: 005-save-and-finalize-routes
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
status: complete
priority: must
created: 2026-07-02T00:00:00.000Z
assigned_bolt: 021-per-answer-verdict-save
implemented: true
---

# Story: 005-save-and-finalize-routes

# User Story

**As** an Evaluator
**I want** HTTP endpoints for per-Answer save and for finalize
**So that** I can record verdicts incrementally and ODPC can finalize separately

## Acceptance Criteria

- [ ] **Given** the evaluator surface, **When** routes are wired, **Then** `POST /twhp/api/evaluators/covers/:coverId/answers/:answerId/verdict` accepts a single `VerdictEntry` and calls `saveAnswerVerdict`
- [ ] **Given** the evaluator surface, **When** routes are wired, **Then** `POST /twhp/api/evaluators/covers/:coverId/finalize` (empty body) calls `finalize` and is reachable only by ODPC (tier-1 → `403`)
- [ ] **Given** the old batch endpoint, **When** the refactor lands, **Then** `POST /twhp/api/evaluators/covers/:coverId/verdict` (batch) is **removed**
- [ ] **Given** both new routes, **When** invoked, **Then** they resolve the reviewer via `resolveEvaluator` and pass the `ReviewerContext` to the service (routes stay thin; no business logic)
- [ ] **Given** `answerId`/`coverId` path params, **When** parsed, **Then** they are validated as numbers (`t.Object({ coverId: t.Number(), answerId: t.Number() })`)
- [ ] **Given** service `status(code, body)` responses, **When** returned, **Then** routes return them directly; OpenAPI `detail`/`response` codes cover `200/400/403/404`
- [ ] **Given** `GET …/covers/:coverId/answers`, **When** the refactor lands, **Then** it is unchanged

## Technical Notes

- Autoloaded route files: `src/routes/evaluators/covers/[coverId]/answers/[answerId]/verdict/index.ts` and `.../covers/[coverId]/finalize/index.ts`; delete the old `.../verdict/index.ts` batch route.
- Reuse `evalGuard`; finalize additionally checks the resolved level is ODPC.

## Dependencies

### Requires
- 001-verdict-schema-refactor
- 003-authorship-edit-guard
- 004-odpc-finalize-action

### Enables
- 006-admin-surface-parity
- 007-answers-list-and-docs-regression

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Tier-1 calls finalize | `403` |
| POST to removed batch `verdict` path | `404` (route gone) |
| Non-numeric `answerId` | `400` (param validation) |

## Out of Scope

- Admin surface (006); docs regen + test restructure (007).
