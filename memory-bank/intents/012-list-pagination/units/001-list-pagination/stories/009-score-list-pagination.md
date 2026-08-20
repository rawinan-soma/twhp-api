---
id: 009-score-list-pagination
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 027-list-pagination
implemented: true
---

# Story: 009-score-list-pagination

## User Story

**As a** DOED Admin, Evaluator, or Provincial Officer reviewing assessment results
**I want** the Score Report list endpoints to return one page at a time
**So that** reading national or regional results no longer builds every Score Report to send twenty

## Acceptance Criteria

- [ ] **Given** `GET /admins/score`, `GET /evaluators/score`, and `GET /provincialOfficers/score`,
  **When** each is called, **Then** all three accept `page` and `limit` and return the shared
  envelope.
- [ ] **Given** a Score Report page, **When** an item is inspected, **Then** it keeps its existing
  fields: `factoryId`, `factoryNameTh`, `coverId`, `coverStatus`, `enrollId`, nullable `grade`, and
  the nested `scoring` breakdown.
- [ ] **Given** the Admin endpoint with `region` or `provinceId`, **When** the page is returned,
  **Then** those filters behave exactly as today and are reflected in `meta.total`.
- [ ] **Given** an Evaluator caller, **When** the page is returned, **Then** it remains scoped to
  that Evaluator's health region.
- [ ] **Given** a Provincial Officer caller, **When** the page is returned, **Then** it remains
  scoped to that officer's province.
- [ ] **Given** a `finished` Cover on the page, **When** its report is built, **Then** it carries the
  Grade computed by the existing formula; **and given** an `in_review` Cover, **Then** `grade` is
  `null`.

## Technical Notes

- Primary seam: `getAllScores`, `getScoresByRegion`, and `getScoresByProvince` in
  `src/service/score.ts`, plus their three route files.
- `ScoreReportListSchema` in `src/schema/score.ts` is replaced by the envelope wrapping the existing
  `ScoreReportSchema`. The item schema itself does not change.
- The Factory single-report endpoint `GET /factories/assessments/score` is deliberately untouched. It
  returns one Cover and has no pagination need.
- This story completes the pair begun by stories 007 and 008; it should not be attempted before both
  are in place.

## Dependencies

### Requires

- 002-pagination-response-envelope
- 007-score-status-sql-pushdown
- 008-page-scoped-answer-fanout

### Enables

- 010-pagination-contract-documentation
- 011-pagination-regression-coverage

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No scorable Cover in scope | `items: []`, `total: 0`, `totalPages: 0`, status 200 |
| Evaluator whose account resolves no region | Existing `404 invalid evaluator` returned unwrapped |
| Mixed `in_review` and `finished` Covers on one page | Each item carries its own correct `grade` value |

## Out of Scope

- The Factory single Score Report endpoint.
- Any change to scoring or Grade rules.
