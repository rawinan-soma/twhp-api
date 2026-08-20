---
id: 007-score-status-sql-pushdown
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 027-list-pagination
implemented: true
---

# Story: 007-score-status-sql-pushdown

## User Story

**As a** staff client reading Score Reports
**I want** the database to exclude Covers that are not ready for scoring
**So that** a page of Score Reports is full and the reported total matches the scorable set

## Acceptance Criteria

- [ ] **Given** the Score Report list queries, **When** Covers are selected, **Then** Covers whose
  latest status is `in_progress` are excluded by the SQL predicate, not by a JavaScript filter.
- [ ] **Given** the same data, **When** the new query and the current implementation are compared,
  **Then** the set of included Covers is identical.
- [ ] **Given** a Score Report list request, **When** `meta.total` is computed, **Then** it equals
  the number of `in_review` and `finished` Covers in scope.
- [ ] **Given** a Cover with several CoverLogs, **When** its status is resolved, **Then** the
  greatest-ID row wins, consistent with intents `007` and `011`.
- [ ] **Given** the Admin `region` and `provinceId` filters, **When** either is supplied, **Then**
  it is combined with the status predicate and reflected in `meta.total`.
- [ ] **Given** an `in_review` Cover on the page, **When** its report is built, **Then** `grade` is
  `null`, preserving the finished-only Grade rule from intent `011`.

## Technical Notes

- Primary seam: `buildScoreReports` in `src/service/score.ts`, together with the three caller queries
  `getAllScores`, `getScoresByRegion`, and `getScoresByProvince`.
- The current shape fetches every Cover in scope, resolves the latest status in a second query, then
  removes `in_progress` Covers in memory. That in-memory step is the correctness blocker.
- Use the same latest-log-wins SQL technique chosen for story 005, so the codebase has one pattern
  rather than two.
- The three caller queries currently have no `ORDER BY`. Story 003 supplies the total order this
  story depends on.
- Do not change `calculateBreakdown`, `computeGrade`, or the choice-to-points mapping. Only the
  selection of Covers changes.

## Dependencies

### Requires

- 003-deterministic-list-ordering

### Enables

- 008-page-scoped-answer-fanout
- 009-score-list-pagination

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Cover has no CoverLog | Preserve current behavior: not scorable, excluded from the list |
| Every Cover in scope is `in_progress` | `items: []`, `total: 0`, `totalPages: 0`, status 200 |
| Region filter that matches no province | Empty page with accurate metadata |

## Out of Scope

- The Answer read volume, owned by story 008.
- The Factory single Score Report endpoint, which returns one Cover and is not paginated.
