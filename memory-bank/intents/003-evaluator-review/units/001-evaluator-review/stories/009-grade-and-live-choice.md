---
id: 009-grade-and-live-choice
unit: 001-evaluator-review
intent: 003-evaluator-review
status: draft
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 010-evaluator-review
implemented: false
---

# Story: 009-grade-and-live-choice

## User Story

**As a** factory / officer / admin
**I want** the score and an award Grade computed from the agreed (verdict-adjusted) choices
**So that** a finished Cover reports its final result and tier

## Acceptance Criteria

- [ ] **Given** scoring, **When** computed, **Then** each answer contributes its **live choice** — the factory's `selectedChoice`, or an accepted Verdict Score (`recommended`/`finished` with a `verdict_choice`) where one replaced it; open verdicts do not affect the score
- [ ] **Given** a `finished` Cover, **When** graded (top-down, first match), **Then**: `gold` = every category `>80%` ∧ overall `≥90%` ∧ full score (`"3"`) on every `special` 1/3 question; `silver` = every category `>60%` ∧ overall `≥80%`; `certificate` = overall `≥60%`; `joined` = overall `<60%`
- [ ] **Given** a non-`finished` Cover, **When** the Score Report is built, **Then** `grade` is `null`
- [ ] **Given** the finalize response (ODPC → `finished`), **When** returned, **Then** it includes the computed `grade`
- [ ] **Given** the factory/evaluator/provincial/admin score endpoints, **When** a Cover is `finished`, **Then** each Score Report carries its `grade`
- [ ] **Given** the grade, **When** computed, **Then** it is derived on-demand and never persisted

## Technical Notes

- Extend `scoreService`: a `liveChoice(answer)` resolver (latest accepted choice) feeds both the existing score formula and the grade gates
- Grade is a pure function of category scores + overall + special-question full-scores; implement as ordered predicates (`else if`)
- Reuse the existing per-category score computation (intent 001)

## Dependencies

### Requires
- 001-schema-changes
- 005-finalize-and-transition

### Enables
- 010-verdict-email (email carries the grade)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Category exactly 80% | Fails `gold` (`>80` strict) → `silver` |
| Overall ≥90% but a category ≤60% | `certificate` (deliberate cliff) |
| n/a-only category | Does not happen (PO invariant) |

## Out of Scope

- New score endpoint (ADR-0001 — extend existing only)
