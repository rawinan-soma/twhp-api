---
id: factory-grace-window
title: 31-day Factory grace window for unfinished prior-year Covers
intent: fiscal-year-addressing
complexity: high
mode: validate
status: completed
depends_on:
  - past-year-write-authority
created: 2026-08-20T09:10:00Z
migrated_from: memory-bank/bolts/033-out-of-year-writes
run_id: run-twhp-elysia-004
completed_at: 2026-08-22T15:42:00.480Z
---

# Work Item: 31-day Factory grace window for unfinished prior-year Covers

## Description

Give Factories 31 days to finish what the boundary interrupted.

Declare the grace window once — as a rule relative to a fiscal-year boundary, not as two hard-coded
2026 dates — and apply it to the Factory answer and submission paths so an unfinished prior-year
Cover can still be completed, while prior-year enrollment stays immutable.

This is the work item that addresses the originating concern directly.

## Acceptance Criteria

- [ ] One declared grace policy covering 2026-10-01 → 2026-10-31 inclusive; no competing literal
      exists in any service.
- [ ] The policy answers "does Factory grace apply to this target year at this instant", consuming
      the `fiscal-year-resolver` rather than host-local date arithmetic.
- [ ] Grace applies at 2026-10-31 23:59:59.999 Bangkok and does not at 2026-11-01 00:00:00.000.
- [ ] Only the **immediately preceding** fiscal year is covered; FY2025 is not covered in Oct 2026.
- [ ] When the target year is the current one, grace is not consulted and does not gate anything.
- [ ] During the window a Factory may save and update answers, and submit the Cover
      (`in_progress → in_review`, `src/service/answer.ts:344`).
- [ ] A Factory attempting to **create or edit a prior-year enrollment** is refused, during and after
      the window.
- [ ] A Cover already at `finished` is never reopened.
- [ ] After 2026-10-31 a Factory's prior-year writes are refused with the distinct, logged
      out-of-year response.
- [ ] A prior-year Cover already at `in_review` is not Factory-writable — it belongs to DOED/ODPC.
- [ ] Grace-window writes record the acting Factory and that grace authorised them.
- [ ] File I/O stays outside database transactions on the grace submission path.
- [ ] Per-answer verdict behaviour and the finished-Cover reward guard are unchanged.
- [ ] No scheduled job, sweep, or persisted flag is introduced.
- [ ] No database schema change of any kind.

## Technical Notes

**Express the window as "31 days after the rollover boundary", not as literal 2026 dates.** The 2026
dates are the first instance of a recurring rule; hard-coding them would silently drop the grace
window in FY2028 with no failing test to notice.

**Duplication is the failure mode most likely to escape review.** A Factory admitted by the
answer-save path and refused by the submit path would experience the system as losing its work at the
last step. One value, one predicate, consulted everywhere.

If the policy becomes an env var it must be validated at startup in `src/config.ts` like every other
— the project forbids reaching for `Bun.env` directly elsewhere.

**Grace is evaluated at write time.** No persisted marker, no job. This follows from the
no-schema-change constraint and keeps expiry a permission change rather than a state change.
**Design-doc candidate**: write-time evaluation versus a scheduled sweep.

The upload-then-transact ordering matters more here than usual. A submission failing partway through
near the end of the window could otherwise leave orphaned objects behind at exactly the moment the
Factory loses the ability to retry.

Once a grace-window Cover reaches `in_review`, `past-year-write-authority` carries it the rest of the
way, with no deadline.

## Dependencies

- past-year-write-authority

## Source Stories

- `003-factory-grace-window-policy` (Must)
- `004-grace-window-cover-completion` (Must)
