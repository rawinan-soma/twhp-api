---
id: fiscal-year-read-addressing
title: Fiscal-year addressing across all read paths
intent: fiscal-year-addressing
complexity: medium
mode: confirm
status: completed
depends_on:
  - fiscal-year-resolver
created: 2026-08-20T09:10:00Z
migrated_from: memory-bank/bolts/030-fiscal-year-reads
run_id: run-twhp-elysia-002
completed_at: 2026-08-21T13:07:26.381Z
---

# Work Item: Fiscal-year addressing across all read paths

## Description

Thread the resolved fiscal-year window through every fiscal-scoped read path — nine staff list
endpoints and four Factory self-read paths — and return the resolved year with the data.

Role scoping, filters, pagination, and response shapes stay exactly as they are when the parameter
is omitted.

## Acceptance Criteria

- [ ] `fiscalYear` accepted on `/admins/enrolls`, `/evaluators/enrolls`, `/provincialOfficers/enrolls`,
      `/admins/factories`, `/evaluators/factories`, `/provincialOfficers/factories`, `/admins/score`,
      `/evaluators/score`, `/provincialOfficers/score`.
- [ ] `fiscalYear` accepted on `/factories/enrolls`, `/factories/assessments`, and
      `/factories/assessments/score`.
- [ ] Every touched endpoint called **without** `fiscalYear` returns a byte-identical response.
- [ ] Count and page queries apply the identical resolved window, so `meta.total` and the page agree.
- [ ] Role scoping unchanged for any addressed year: Factory to itself, Provincial to its province,
      Evaluator to its region, DOED national.
- [ ] A valid year with no data returns an empty page (`meta.total: 0`, `totalPages: 0`) at 200 —
      never a 404.
- [ ] Existing `coverStatus`, `validated`, `enrolled`, `region`, and `provinceId` filters behave
      exactly as today when combined with `fiscalYear`.
- [ ] Factory self-reads are scoped to the JWT subject's `accountId`; no parameter value widens scope.
- [ ] The finished-Cover reward rule from `011-finished-cover-reward-guard` applies to an addressed
      past year exactly as to the current one.
- [ ] Enrollment, cover, score, and list-item responses carry the Common Era `fiscalYear`, derived
      via the resolver helper — not recomputed in a route or inferred by a client.
- [ ] No service constructs date boundaries itself.
- [ ] No database schema change of any kind.

## Technical Notes

Seams: `listEnrolls` (`src/service/enroll.ts:91`), `listScoreReports` (`src/service/score.ts:126`),
the Factory list path (`src/service/factory.ts:51`), `getEnrollByFactoryId`
(`src/service/enroll.ts:518`), `getCoverById` (`src/service/cover.ts:50`), the answer reads
(`src/service/answer.ts:350,397`), and `getScoreByFactory` (`src/service/score.ts:177`).

**Two known traps.** The Factory list uses a correlated `EXISTS` rather than an `enrolls` join
specifically because the join multiplied rows and corrupted `meta.total` — the decision index records
this. Threading a window is exactly the edit that tempts a return to a join. Separately,
`enrolled=false` currently disables the fiscal-year date filter altogether; intent `012` deliberately
left that semantic alone and so does this. Document the interaction with `fiscalYear` rather than
quietly rationalising it.

The response `fiscalYear` must derive from the same helper that produced the filter window. Two
derivations can disagree at a boundary, letting a row be selected as one year and displayed as
another — the precise failure this intent exists to reduce.

Note that `.limit(1)` self-reads become deterministic *for a given year* but not in general: BR-07
gains no database constraint here, so duplicate enrollments within one year would still resolve
arbitrarily. Do not claim determinism the schema does not provide.

## Dependencies

- fiscal-year-resolver

## Source Stories

- `003-staff-list-fiscal-year-addressing` (Must)
- `004-factory-self-read-fiscal-year-addressing` (Must)
- `005-fiscal-year-in-responses` (Should)
