---
id: concurrent-years-and-audit
title: Concurrent open years, out-of-year audit, and expiry disposition
intent: fiscal-year-addressing
complexity: medium
mode: confirm
status: completed
depends_on:
  - fiscal-year-read-addressing
  - factory-grace-window
created: 2026-08-20T09:10:00Z
migrated_from: memory-bank/bolts/034-out-of-year-writes
run_id: run-twhp-elysia-004
completed_at: 2026-08-22T15:50:03.802Z
---

# Work Item: Concurrent open years, out-of-year audit, and expiry disposition

## Description

Resolve what a Factory holding two open years reads by default, establish attribution for
out-of-year writes, and settle what an expired Cover is.

During the grace window a Factory legitimately holds a FY2026 Cover being finished and a new FY2027
enrollment — **a condition that cannot occur in the system as it stands today.**

## Acceptance Criteria

- [ ] With two open years, a self-read without `fiscalYear` returns the **current** year's record.
- [ ] With two open years, a self-read with `fiscalYear=2026` returns the grace-window record.
- [ ] A write targets the record the request addresses; that record's own year determines
      authorisation — never an implicit "most recent" selection.
- [ ] `coverService.create` succeeds for the new year alongside an unfinished prior-year Cover.
      **Proven by test, not assumed from reading `src/service/cover.ts:30-33`.**
- [ ] No `.limit(1)` self-read in `enroll`, `cover`, `answer`, or `score` returns a row from the year
      that was not requested.
- [ ] New-year enrollment creation during the grace window succeeds, unaffected by the prior year's
      unfinished state.
- [ ] Granted out-of-year writes record the acting identity, target fiscal year, and authorising
      authority.
- [ ] Refused out-of-year writes are logged distinguishably from the wrong-region 404 and from a
      genuine not-found.
- [ ] A Cover still `in_progress` at window close undergoes **no** status transition, generates **no**
      `coverLogs` row from expiry itself, and is touched by **no** job or sweep. It remains
      `in_progress`.
- [ ] Such a Cover stays readable by every role and writable by DOED/ODPC indefinitely.
- [ ] Scoring is unchanged — `SCORABLE_STATUSES` already excludes `in_progress`
      (`src/service/score.ts:26`); **no change is made** to achieve this.
- [ ] Status transitions that *do* occur through granted out-of-year writes produce a `coverLogs`
      entry with actor, as today.
- [ ] No Cover status, flag column, or persisted expiry marker is added.
- [ ] `docs/business-rules.md` and `docs/handover.md` reflect what this intent did and did not resolve.

## Technical Notes

**This is the most likely place in the intent to surface a latent defect.** Every `.limit(1)`
self-read was written assuming a Factory has at most one live enrollment, and the grace window breaks
that assumption for the first time. Enumerate the sites — `src/service/enroll.ts:518`,
`src/service/cover.ts:50`, `src/service/answer.ts:350,397`, `src/service/score.ts:177` — and test each
under two open years rather than reasoning about them.

The default must be the current year. A Factory in October is primarily working the new year; the old
one is the exception and should require naming.

**Resist the pull toward an `expired` status.** `coverStatus` is fixed at three values
(`src/drizzle/schema.ts:296`), adding one is a schema change, and no substitute should be invented in
its place. A Cover that stays `in_progress` forever is the intended outcome — document it directly so
a future reader does not mistake it for an unhandled case and "fix" it. **Design-doc candidate**:
expiry as a permission change rather than a Cover state.

`coverLogs` carries `evaluatorId` (`src/drizzle/schema.ts:313`). Confirm whether it can attribute a
grace-window **Factory** write before assuming it can; if it cannot, attribution for those belongs in
the request log rather than in a new column — which would be a schema change.

Use the existing logging flow: `onError` classifies expected errors and `onAfterResponse` logs
unlogged 4xx (`src/index.ts`). No ad-hoc `console.log`.

Before closing, confirm the intent's accepted limitations are recorded rather than quietly dropped:
BR-06 remains Unknown at the PostgreSQL boundary, BR-07 remains application-only, and historical
region still derives from a Factory's current location.

## Dependencies

- fiscal-year-read-addressing
- factory-grace-window

## Source Stories

- `005-concurrent-open-year-disambiguation` (Must)
- `006-out-of-year-write-audit` (Must)
