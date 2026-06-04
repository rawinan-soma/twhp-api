---
id: 002-category-breakdown
unit: 001-score-service
intent: 001-score-calculator-and-report
status: complete
priority: must
created: 2026-06-03T00:00:00.000Z
assigned_bolt: 001-score-service
implemented: true
---

# Story: 002-category-breakdown

## User Story

**As a** developer building the score service
**I want** the score calculation to produce per-category scores alongside the total
**So that** every Score Report exposes `collaborate`, `disease`, `safety`, `mental`, `outcome` breakdowns

## Acceptance Criteria

- [ ] **Given** answers spanning all 5 categories, **When** score calculated, **Then** response contains `totalScore`, `collaborate`, `disease`, `safety`, `mental`, `outcome`
- [ ] **Given** a category has no answers (e.g. factory answered nothing in `Mental`), **When** score calculated, **Then** that category score is `0`
- [ ] **Given** a category has only `n/a` answers, **When** score calculated, **Then** that category score is `0`
- [ ] **Given** answers in `Collaborate` are all `"3"`, **When** score calculated, **Then** `collaborate` = `100`
- [ ] **Given** different scores per category, **When** score calculated, **Then** `totalScore` reflects all answers combined (not average of category scores)

## Technical Notes

- Group answers by `question.category` using a Map or reduce
- Apply the same formula from story 001 per category group
- `totalScore` uses all non-n/a answers together (not a mean of category scores)
- `QuestionCategories` enum: `Collaborate`, `Disease`, `Safety`, `Mental`, `Outcome` — map to lowercase keys in response

## Dependencies

### Requires

- 001-score-formula (reuses formula logic)

### Enables

- 004-factory-endpoint through 007-admin-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| No answers exist for a category | Score for that category = 0 |
| All answers in one category are `n/a` | Score = 0 for that category |

## Out of Scope

- Weighted categories
- Sub-category breakdown
