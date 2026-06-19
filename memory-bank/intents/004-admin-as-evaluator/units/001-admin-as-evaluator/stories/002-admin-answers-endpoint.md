---
id: 002-admin-answers-endpoint
unit: 001-admin-as-evaluator
intent: 004-admin-as-evaluator
status: complete
priority: must
created: 2026-06-19T00:00:00.000Z
assigned_bolt: 011-admin-as-evaluator
implemented: true
---

# Story: 002-admin-answers-endpoint

## User Story

**As a** DOED admin
**I want** to list every Answer on any Cover, in any region, with its review status
**So that** I can review a submitted Cover as a national ODPC before finalizing it

## Acceptance Criteria

- [ ] **Given** `GET /twhp/api/admin/covers/:coverId/answers`, **When** called by a DOED
  admin, **Then** the route resolves a synthesized context
  `{ accountId: Number(jwtPayload.sub), level: "ODPC", region: null }` and calls
  `getAnswers`
- [ ] **Given** an admin caller, **When** the answers are returned, **Then** **all 5
  categories** are included (ODPC ownership) with no region filter
- [ ] **Given** a Cover in any `provinces.health_region`, **When** an admin requests it,
  **Then** it is returned (no region `404`)
- [ ] **Given** a non-existent `coverId`, **When** requested, **Then** `404
  { message: "cover not found" }`
- [ ] **Given** the response, **When** serialized, **Then** it reuses `AnswerViewSchema`
  verbatim (`answerId`, `questionId`, `category`, `status`, `selectedChoice`,
  `latestVerdictChoice`, `latestDescription`)
- [ ] **Given** a non-DOED caller (Evaluator/Factory/Provincial), **When** they hit
  `/admin/covers/*`, **Then** `adminGuard` returns `403`

## Technical Notes

- New route `src/routes/admin/covers/[coverId]/answers/index.ts` under `adminGuard`,
  autoloaded (mirrors `src/routes/evaluators/covers/[coverId]/answers/index.ts`).
- Tag the OpenAPI detail under `["admin"]` (or `["admin-review"]`).
- Reuse `AnswerViewSchema` from `src/schema/evaluator-review.ts` for the `200` response.
- No service logic beyond the reviewer-context seam (story 001).

## Dependencies

### Requires
- 001-reviewer-context-seam

### Enables
- 003-admin-verdict-endpoint (shares the route group + context synthesis)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Cover with answers spread across all categories | All returned (ODPC ownership) |
| Cover with no answers | `[]` (empty array), `200` |
| Evaluator token on `/admin/*` | `403` (guard) |

## Out of Scope

- Writing verdicts / finalize (003); any new response shape.
