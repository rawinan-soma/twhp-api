---
id: 004-factory-self-read-fiscal-year-addressing
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 030-fiscal-year-reads
implemented: false
---

# Story: 004-factory-self-read-fiscal-year-addressing

## User Story

**As a** Factory
**I want** to read my own enrollment, assessment, answers, and score for a named fiscal year
**So that** last year's submission and grade remain available to me after the boundary passes,
instead of vanishing overnight

## Acceptance Criteria

- [ ] **Given** the Factory self-read paths — enrollment (`/factories/enrolls`), assessment cover
  and answers (`/factories/assessments`), and score (`/factories/assessments/score`) — **When**
  each is called with `fiscalYear`, **Then** it returns that year's record for the calling Factory.
- [ ] **Given** any of those paths called without `fiscalYear`, **When** it responds, **Then** the
  response is byte-identical to today's, including the existing `{ message: "no enrollment found" }`
  and 404 shapes.
- [ ] **Given** a Factory addressing a year in which it never enrolled, **When** it reads, **Then**
  it receives the existing not-found response for that path — not another Factory's data and not an
  error implying the year is invalid.
- [ ] **Given** a Factory addressing any year, **When** the query runs, **Then** it is scoped to that
  Factory's own `accountId`; no parameter value can widen the scope.
- [ ] **Given** the score path, **When** a past year is addressed, **Then** the finished-Cover reward
  rule from `011-finished-cover-reward-guard` applies to that year's Cover exactly as it does to the
  current one.

## Technical Notes

- Seams: `getEnrollByFactoryId` (`src/service/enroll.ts:518`), `getCoverById`
  (`src/service/cover.ts:50`), the answer read paths (`src/service/answer.ts:350,397`), and
  `getScoreByFactory` (`src/service/score.ts:177`).
- Every one of these uses `.limit(1)` over a fiscal-year-filtered query. With an explicit year the
  selection becomes deterministic for that year — but note that BR-07 remains
  application-only in this intent, so duplicate enrollments within one year would still resolve
  nondeterministically. Do not claim determinism the schema does not provide.
- `factoryId` continues to come from the JWT subject, never from the request. Threading `fiscalYear`
  must not introduce any path where an identifier is read from user input.
- The answer read at `src/service/answer.ts:397` resolves the Cover through the enrollment's fiscal
  window; it inherits addressing automatically once the window is threaded, but assert it.

## Dependencies

### Requires

- 001-fiscal-year-resolver
- 002-fiscal-year-query-contract

### Enables

- 005-fiscal-year-in-responses
- 006-fiscal-year-boundary-coverage
- 005-concurrent-open-year-disambiguation (unit `002-out-of-year-writes`)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Factory enrolled in FY2026 but not FY2027, reading after rollover with no parameter | Existing not-found response for the current year — the pre-intent behaviour, now explicable rather than mysterious |
| Same Factory addressing `fiscalYear=2026` | Its FY2026 enrollment, cover, answers, and score |
| Factory addressing a year in which its Cover never left `in_progress` | Cover and answers readable; score follows the existing non-scorable rule, since `SCORABLE_STATUSES` excludes `in_progress` |
| Factory addressing a future year | Existing not-found response; no error, no clamping |
| Factory with duplicate enrollments in one year (pre-existing data) | `.limit(1)` still resolves arbitrarily — a documented consequence of forgoing the unique constraint |

## Out of Scope

- Disambiguating which year a Factory reads *by default* while holding two open years. That
  condition only exists once the grace window does, and is owned by unit `002-out-of-year-writes`.
- Any write path.
