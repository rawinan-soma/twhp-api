---
id: 003-staff-list-fiscal-year-addressing
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 030-fiscal-year-reads
implemented: false
---

# Story: 003-staff-list-fiscal-year-addressing

## User Story

**As a** DOED Admin, Evaluator, or Provincial Officer
**I want** to name the fiscal year when I read Enrollment, Factory, and Score Report lists
**So that** the morning after rollover my lists are not empty, and I can still work a closed year

## Acceptance Criteria

- [ ] **Given** the Enrollment lists (`/admins/enrolls`, `/evaluators/enrolls`,
  `/provincialOfficers/enrolls`), the Factory lists (`/admins/factories`, `/evaluators/factories`,
  `/provincialOfficers/factories`), and the Score Report lists (`/admins/score`, `/evaluators/score`,
  `/provincialOfficers/score`), **When** each is called with `fiscalYear`, **Then** it returns that
  year's rows.
- [ ] **Given** any of those endpoints called without `fiscalYear`, **When** it responds, **Then**
  the response is byte-identical to today's.
- [ ] **Given** a paginated request with `fiscalYear`, **When** the count and page queries run,
  **Then** both apply the identical resolved window, so `meta.total` and the page agree.
- [ ] **Given** an Evaluator caller, **When** a past year is addressed, **Then** results stay scoped
  to that Evaluator's health region; **Given** a Provincial Officer, to that officer's province;
  **Given** a DOED Admin, national.
- [ ] **Given** a valid year with no data, **When** the list is returned, **Then** it is an empty
  page with `meta.total: 0` and `totalPages: 0` at status 200 — never a 404.
- [ ] **Given** the existing `coverStatus`, `validated`, `enrolled`, `region`, and `provinceId`
  filters, **When** combined with `fiscalYear`, **Then** each behaves exactly as today.

## Technical Notes

- Seams: `listEnrolls` (`src/service/enroll.ts:91`), `listScoreReports` (`src/service/score.ts:126`),
  and the Factory list path (`src/service/factory.ts:51`), plus their nine route files.
- These services already accept a `PaginationQueryDto`-shaped options object. Add the resolved
  window to that object rather than re-deriving inside each function.
- Preserve the `EXISTS` predicate on the Factory list introduced by `012-list-pagination` — the
  decision-index records that replacing the `enrolls` join removed row multiplication that broke
  `meta.total`. Do not reintroduce a join while threading the window.
- The `enrolled=false` behaviour, which currently disables the fiscal-year date filter, is preserved
  as-is. `012` deliberately left that semantic alone; this story does too.
- Latest-log-wins continues to use the greatest `CoverLogs.id`, never a timestamp.

## Dependencies

### Requires

- 001-fiscal-year-resolver
- 002-fiscal-year-query-contract

### Enables

- 005-fiscal-year-in-responses
- 006-fiscal-year-boundary-coverage

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A region with no enrollments in the requested year | `items: []`, `total: 0`, status 200 |
| `fiscalYear` addressing a year before any data exists | Empty page, not an error |
| `enrolled=false` combined with `fiscalYear` | Date filter stays disabled as today; `fiscalYear` has no effect on that path, and this is documented rather than silently surprising |
| A Factory that relocated since the addressed year | Region derives from the Factory's **current** location — the known FR-3 limitation; assert the behaviour so it is visible rather than accidental |
| Page 2 of a past year | Ordering deterministic and total order preserved, per `012` |

## Out of Scope

- Factory self-reads, owned by story 004.
- Adding `fiscalYear` to the response body, owned by story 005.
- Any change to filters, guards, ordering, or the pagination envelope.
