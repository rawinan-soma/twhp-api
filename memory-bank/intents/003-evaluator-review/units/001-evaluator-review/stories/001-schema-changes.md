---
id: 001-schema-changes
unit: 001-evaluator-review
intent: 003-evaluator-review
status: complete
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 006-evaluator-review
implemented: true
---

# Story: 001-schema-changes

## User Story

**As a** developer building the review flow
**I want** the schema to represent verdict scores and a provisional approval state
**So that** evaluators can correct scores and tier-1 approvals stay ODPC-overridable

## Acceptance Criteria

- [ ] **Given** `schema.ts`, **When** updated, **Then** `answerLogs` has a nullable `verdict_choice` using the `Choices` enum (only `0`/`1`/`2`/`3` ever written — never `n/a`)
- [ ] **Given** the `answerStatus` pgEnum, **When** updated, **Then** it has four values `in_review | recommended | rejected | finished`
- [ ] **Given** the Score Report response schema, **When** updated, **Then** it carries an optional/nullable `grade` field (`gold|silver|certificate|joined`)
- [ ] **Given** `db:push`, **When** run on dev, **Then** the column + enum value apply without manual migration edits
- [ ] **Given** every existing `answerStatus` switch/derivation (score guard, cover-transition, answer-state reads), **When** audited, **Then** each explicitly accounts for `recommended`

## Technical Notes

- Single-file schema `src/drizzle/schema.ts`; regenerate base TypeBox via `src/schema/index.ts` (`createSelectSchema` etc.)
- `verdict_choice` reuses the existing `choices` pgEnum; app-layer validation restricts to `0–3`
- Generate via schema.ts + `bun run db:push`; **await human review** (no direct migration-file edits)

## Dependencies

### Requires
- None (foundational)

### Enables
- 004-verdict-batch-endpoint
- 005-finalize-and-transition
- 009-grade-and-live-choice

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Existing rows pre-migration | `verdict_choice` null; status values unaffected |
| Code writes `n/a` to verdict_choice | Rejected at app layer (never persisted) |

## Out of Scope

- Business logic for the new states (later stories)
