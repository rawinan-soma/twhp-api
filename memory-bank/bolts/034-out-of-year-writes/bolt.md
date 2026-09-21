---
id: 034-out-of-year-writes
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
type: ddd-construction-bolt
status: planned
stories:
  - 005-concurrent-open-year-disambiguation
  - 006-out-of-year-write-audit
created: 2026-08-20T08:55:00Z
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts:
  - 030-fiscal-year-reads
  - 033-out-of-year-writes
enables_bolts: []
requires_units:
  - 001-fiscal-year-reads
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 3
  testing_scope: 5
---

# Bolt: 034-out-of-year-writes

## Overview

Resolve what a Factory holding two open years reads by default, and settle what an expired Cover is.

## Objective

Make every self-read unambiguous while a grace-window year and a current year coexist — a condition
that cannot occur in the system as it stands today — and establish attribution for out-of-year
writes while confirming that expiry mutates nothing.

## Stories Included

- **005-concurrent-open-year-disambiguation**: Two open years resolve unambiguously (Must)
- **006-out-of-year-write-audit**: Attribution, refusal logging, and expiry disposition (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model** → `ddd-01-domain-model.md`
- [ ] **2. Technical Design** → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** → expiry-as-permission-change rather than a Cover state is a candidate
- [ ] **4. Implement**
- [ ] **5. Test** → `ddd-03-test-report.md`

## Dependencies

### Requires

- **030-fiscal-year-reads** (Required): the self-reads being disambiguated
- **033-out-of-year-writes** (Required): the grace window that creates the two-open-years condition

### Enables

- None; terminal bolt of the intent.

## Expected Outputs

- Self-reads defaulting to the current fiscal year while two years are open, with the grace year
  reachable only by explicit `fiscalYear`.
- A test proving `coverService.create` succeeds for the new year alongside an unfinished prior-year
  Cover.
- Audit of every `.limit(1)` self-read in `enroll`, `cover`, `answer`, and `score` under the
  two-open-years condition.
- Attribution on granted out-of-year writes; distinguishable logging on refused ones.
- Confirmation, by test, that expiry writes no status transition and no `coverLogs` row.
- Documentation stating plainly that a permanently `in_progress` Cover is an intended terminal
  outcome of this design.

## Success Criteria

- [ ] Both stories satisfy every acceptance criterion.
- [ ] No `.limit(1)` self-read returns a row from the year that was not requested.
- [ ] `coverService.create` for the new year is proven by test, not assumed from reading
      `src/service/cover.ts:30-33`.
- [ ] Expiry performs no mutation, writes no log row, and runs no job.
- [ ] `SCORABLE_STATUSES` is unchanged; an `in_progress` Cover is already non-scorable.
- [ ] Out-of-year refusals are distinguishable from 404s in logs.
- [ ] No Cover status, flag column, or persisted expiry marker is added.
- [ ] `docs/business-rules.md` and `docs/handover.md` reflect what this intent did and did not resolve.
- [ ] Code and artifacts reviewed.

## Notes

Story 005 is the most likely place in this intent to surface a latent defect, because the condition
it addresses is genuinely new. Every `.limit(1)` self-read in the codebase was written under the
assumption that a Factory has at most one live enrollment, and the grace window breaks that
assumption for the first time. Enumerate the sites — `src/service/enroll.ts:518`,
`src/service/cover.ts:50`, `src/service/answer.ts:350,397`, `src/service/score.ts:177` — and test
each under two open years rather than reasoning about them.

Resist the pull toward an `expired` status. `coverStatus` is fixed at three values, adding one is a
schema change, and no substitute should be invented in its place. A Cover that stays `in_progress`
forever is the intended outcome, and the documentation should say so directly so a future reader
does not mistake it for an unhandled case and "fix" it.

Before this bolt closes, confirm that the intent's documented limitations are recorded rather than
quietly dropped: BR-06 remains **Unknown** at the PostgreSQL boundary, BR-07 remains
application-only, and historical region still derives from a Factory's current location.
