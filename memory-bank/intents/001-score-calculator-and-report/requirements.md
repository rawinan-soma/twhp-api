---
intent: 001-score-calculator-and-report
phase: inception
status: complete
created: 2026-06-03T00:00:00.000Z
updated: 2026-06-12T00:00:00.000Z
---

# Requirements: Score Calculator and Report

## Intent Overview

Add a score calculation feature that derives a numeric score from a factory's assessment Cover (Answers) and exposes it via role-scoped endpoints. Scores are calculated on-demand (never persisted) and include both an overall score and a breakdown by the five question categories.

## Business Goals

| Goal | Success Metric | Priority |
|------|---------------|----------|
| Allow evaluators to see how well a factory scored per category | Score visible on cover in `in_review` status | Must |
| Allow factories to see their own score as feedback | Factory can query own score after submission | Must |
| Allow provincial officers and admin to see scores across their scope | List endpoint returns all factories with scores | Must |

---

## Functional Requirements

### FR-1: Score Calculation Formula

- **Description**: A Cover's score is calculated from its Answers. Each `selectedChoice` maps to points: `"3"→3`, `"2"→2`, `"1"→1`, `"0"→0`. Answers with `selectedChoice = "n/a"` are excluded from both numerator and denominator. Score = `sum(choice_points) / (3 × non_na_count) × 100%`. The `special` field on Questions has no effect on scoring.
- **Acceptance Criteria**: Given a cover with N non-n/a answers summing to P points, score = `P / (3N) × 100%`. If all answers are `n/a`, score = 0% (or undefined — return 0).
- **Priority**: Must

### FR-2: Per-Category Score Breakdown

- **Description**: In addition to overall score, the response includes a score for each of the five QuestionCategories: `Collaborate`, `Disease`, `Safety`, `Mental`, `Outcome`. Each category score uses the same formula restricted to answers for questions in that category.
- **Acceptance Criteria**: Response contains `totalScore`, `collaborate`, `disease`, `safety`, `mental`, `outcome` as numeric percentage values.
- **Priority**: Must

### FR-3: Score Only Available for In-Review or Finished Covers

- **Description**: The score endpoint rejects requests for covers with `in_progress` status. Score is only meaningful after the factory has submitted (cover moves to `in_review`).
- **Acceptance Criteria**: Requesting a score for an `in_progress` cover returns HTTP 400. Requesting for `in_review` or `finished` cover returns HTTP 200 with score data.
- **Priority**: Must

### FR-4: Factory Score Endpoint

- **Description**: A factory can retrieve their own current fiscal year score.
- **Acceptance Criteria**: `GET /twhp/api/factories/assessments/score` returns a single Score Report for the authenticated factory's cover.
- **Priority**: Must

### FR-5: Evaluator Score List Endpoint

- **Description**: An evaluator can retrieve a list of Score Reports for all factories in their health region.
- **Acceptance Criteria**: `GET /twhp/api/evaluators/score` returns an array of Score Reports filtered by the evaluator's region.
- **Priority**: Must

### FR-6: Provincial Officer Score List Endpoint

- **Description**: A provincial officer can retrieve a list of Score Reports for all factories in their province.
- **Acceptance Criteria**: `GET /twhp/api/provincialOfficers/score` returns an array of Score Reports filtered by the officer's `provinceId`.
- **Priority**: Must

### FR-7: Admin Score List Endpoint

- **Description**: A DOED admin can retrieve all Score Reports with optional filtering by region or province.
- **Acceptance Criteria**: `GET /twhp/api/admins/score` returns all Score Reports. Supports optional query params `?region=` and `?provinceId=` to filter.
- **Priority**: Must

### FR-8: Score Report Shape

- **Description**: Each Score Report (single or in list) contains: `factoryId`, `factoryNameTh`, `coverId`, `coverStatus`, `enrollId`, `totalScore`, `collaborate`, `disease`, `safety`, `mental`, `outcome`.
- **Acceptance Criteria**: All fields present in every response item. Score values are rounded integers (0–100, percentage).
- **Priority**: Must

### FR-9: Score Report exposes scored-question count, max, achieved, and percentage per group (breaking restructure)

- **Description**: Replace the flat score fields with a nested `scoring` object so every score group — overall (`total`) plus the five categories (`collaborate`, `disease`, `safety`, `mental`, `outcome`) — reports four values: `scoredCount` (number of **non-`n/a`** answers in the group), `maxScore` (`3 × scoredCount`), `achievedScore` (`sum(choice_points)` — the formula numerator), and `percentage` (`round(achievedScore / maxScore × 100)`). The previously flat fields (`totalScore`, `collaborate`, `disease`, `safety`, `mental`, `outcome`) are **removed** from the response. `n/a` answers are excluded from all four values.
- **Acceptance Criteria**:
  - Response has no top-level `totalScore`/`collaborate`/`disease`/`safety`/`mental`/`outcome`; instead a `scoring` object with keys `total`, `collaborate`, `disease`, `safety`, `mental`, `outcome`.
  - For each group: `maxScore === 3 × scoredCount`; `0 ≤ achievedScore ≤ maxScore`; `percentage === round(achievedScore / maxScore × 100)` when `scoredCount > 0`, else all four are `0`.
  - `scoring.total.percentage` equals the value the old `totalScore` would have returned (formula unchanged — only the response shape changed).
  - Worked example (50 non-n/a answers, 120 pts): `scoring.total = { scoredCount: 50, maxScore: 150, achievedScore: 120, percentage: 80 }`.
  - Applies identically to the single-object response (factory) and the array responses (evaluator/provincial/admin).
- **Priority**: Must

---

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Response Time | p95 latency | < 300ms |

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Authentication | Cookie-based JWT | All endpoints require valid `Authentication` cookie |
| Authorization | RBAC via existing guards | `factoryGuard`, `evalGuard`, `officerGuard`, `adminGuard` |

### Compatibility (FR-9)

| Requirement | Notes |
|-------------|-------|
| Breaking response change | FR-9 removes the flat score fields and nests them under `scoring`. **All consumers must migrate** from `totalScore`/`collaborate`/… to `scoring.total.percentage`/`scoring.collaborate.percentage`/… |
| Consumer migration | Frontend score views + any client reading the four score endpoints must be updated in lockstep with this release |
| Test migration | `src/service/score.test.ts` and `src/service/score.integration.test.ts` assert the flat shape and must be rewritten for the nested shape |

---

## Constraints

### Technical Constraints

- Score is calculated on-demand — no new DB columns or tables required (see ADR 0001)
- Must reuse `utilities().getFiscalYear()` for fiscal year scoping
- Must follow existing service factory pattern: `createScoreService(db)`
- All endpoints are read-only (GET only)

### Business Constraints

- Score is only exposed for the current fiscal year's cover

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|----------------|-----------|
| Every cover has answers for all questions before `in_review` (enforced by submit logic) | Partial covers could produce misleading scores | Submit logic already enforces 100% completion |
| `n/a` answers are valid and should not penalise the factory | Score inflated if abused | Existing question/choice validation controls this |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|-----------|
| Should score be expressed as a float (e.g. 82.5) or rounded integer? | rawinan | 2026-06-03 | Resolved — rounded integer (e.g. 83) |
| Should the new count/max/achieved be overall-only or per-category? | rawinan | 2026-06-12 | Resolved — overall + per category (FR-9) |
| Keep flat percentage fields for backward-compat, or restructure? | rawinan | 2026-06-12 | Resolved — restructure: remove flat fields, nest under `scoring` (breaking) |
