---
id: 008-page-scoped-answer-fanout
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 027-list-pagination
implemented: true
---

# Story: 008-page-scoped-answer-fanout

## User Story

**As an** operator of the TWHP API
**I want** a Score Report request to read only the Answers of the Covers on the requested page
**So that** memory use per request stays constant as the number of assessed Covers grows

## Acceptance Criteria

- [ ] **Given** a Score Report list request, **When** Answers are read, **Then** the query is
  restricted to the Cover IDs on the requested page only.
- [ ] **Given** a page of `limit` Covers, **When** the request completes, **Then** the number of
  Answer rows read is bounded by `limit` multiplied by the number of Questions per Cover.
- [ ] **Given** the maximum `limit` of 100, **When** the request completes, **Then** the Answer read
  stays within that bound regardless of how many Covers exist in scope.
- [ ] **Given** the same data, **When** a Cover's Score, Category Scores, and Grade are compared to
  the current implementation, **Then** they are identical.
- [ ] **Given** an empty page, **When** the request completes, **Then** no Answer query is issued.

## Technical Notes

- Primary seam: the Answer read inside `buildScoreReports` in `src/service/score.ts`.
- Today that read uses the IDs of every filtered Cover. After story 007 the caller can page the Cover
  query first, so this read receives at most `limit` IDs.
- This is the dominant cost of the current implementation. With five thousand Covers the read is
  roughly one hundred and twenty three thousand Answer rows; page-scoped it is roughly eight hundred.
- Keep the existing empty-array guard so that an empty page never issues an `IN ()` query.
- The grouping map and the per-Cover calculation stay as they are; only the input size changes.

## Dependencies

### Requires

- 007-score-status-sql-pushdown

### Enables

- 009-score-list-pagination

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A Cover on the page has no Answers | Its report is built from an empty Answer set, as today |
| Last page holds fewer Covers than `limit` | The Answer read shrinks accordingly |
| A Question is added to the catalogue | The bound scales with Questions per Cover; no code change |

## Out of Scope

- Changing the Score formula, Category Score definition, or Grade thresholds.
- Caching or persisting computed Scores.
