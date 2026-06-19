---
id: 006-evaluator-review
unit: 001-evaluator-review
intent: 003-evaluator-review
type: ddd-construction-bolt
status: complete
stories:
  - 001-schema-changes
  - 002-level-category-access
created: 2026-06-17T00:00:00.000Z
started: 2026-06-17T00:00:00.000Z
completed: "2026-06-17T03:45:43Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-06-17T00:00:00.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-06-17T00:00:00.000Z
    artifact: ddd-02-technical-design.md
  - name: implement
    completed: 2026-06-17T00:00:00.000Z
    artifact: src/
requires_bolts: []
enables_bolts:
  - 007-evaluator-review
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 006-evaluator-review

## Overview

Foundation bolt: the two additive schema changes (`answerLogs.verdict_choice`, `answerStatus += recommended`, Score Report `grade` field) and the server-side level→category access map + region scoping helper. Nothing in this intent compiles without these.

## Objective

Land the schema via `schema.ts` + `db:push` (await human review), audit every existing `answerStatus` switch for the new `recommended` value, and expose `categoriesFor(level)` + region resolution built on `getEvaluatorData`.

## Stories Included

- **001-schema-changes**: `verdict_choice`, `recommended`, `grade` schema (Must)
- **002-level-category-access**: level→category map + region scoping (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: Confirm the 4-state `answerStatus` machine, `verdict_choice` semantics (`0–3`, never `n/a`), and the category-ownership constant
- [ ] **2. design**: Drizzle enum/column changes; TypeBox regeneration impact; inventory of every `answerStatus` consumer to update
- [ ] **3. implement**: `src/drizzle/schema.ts`, `src/schema/*`, a `categoriesFor` constant + helper (extend `evaluatorService`)
- [ ] **4. test**: Migration applies; enum has 4 values; `categoriesFor` returns correct sets; existing status switches handle `recommended`

## Dependencies

### Requires
- None (first bolt of this intent)

### Enables
- 007-evaluator-review

## Success Criteria

- [ ] `db:push` applies the column + enum value cleanly (human-reviewed)
- [ ] No existing `answerStatus` switch silently ignores `recommended`
- [ ] `categoriesFor(level)` matches the CONTEXT.md ownership map

## Notes

- Generate schema via `schema.ts`; **do not** hand-edit migration output
- This bolt is pure groundwork — no endpoints yet
