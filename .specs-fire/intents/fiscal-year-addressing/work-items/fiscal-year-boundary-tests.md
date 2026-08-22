---
id: fiscal-year-boundary-tests
title: Boundary, timezone, scoping, and parity coverage
intent: fiscal-year-addressing
complexity: medium
mode: confirm
status: completed
depends_on:
  - fiscal-year-resolver
  - fiscal-year-read-addressing
created: 2026-08-20T09:10:00Z
migrated_from: memory-bank/bolts/031-fiscal-year-reads
run_id: run-twhp-elysia-002
completed_at: 2026-08-21T13:14:46.408Z
---

# Work Item: Boundary, timezone, scoping, and parity coverage

## Description

Pin the derived fiscal-year rule down with tests, and produce the evidence for the compatibility
claim.

This discharges the fiscal-year testing concern already recorded at `docs/testing.md:118` — Bangkok
Sep 30 / Oct 1 boundaries, leap years, host-timezone independence, and query scoping across enroll,
Cover, answer, score, and factory services.

Because the intent chose not to persist fiscal-year identity, these tests are the only thing keeping
that rule from drifting.

## Acceptance Criteria

- [ ] Resolver returns FY2026 at 2026-09-30 23:59:59.999 Bangkok and FY2027 at
      2026-10-01 00:00:00.000 Bangkok.
- [ ] The suite passes identically under `TZ=UTC` and under `TZ=Asia/Bangkok`; no assertion depends
      on the test host's timezone.
- [ ] A fiscal year containing Feb 29 resolves correctly; no day is skipped or double-counted.
- [ ] Per-role scoping asserted on addressed reads for Factory, Provincial, Evaluator, and DOED.
- [ ] `meta.total` and page contents agree under every combination of `fiscalYear` with the existing
      filters.
- [ ] Parity assertions prove unchanged responses when `fiscalYear` is omitted, on **every** endpoint
      touched by `fiscal-year-read-addressing`.
- [ ] A Factory attempting to address another Factory's year is refused as today.
- [ ] `docs/business-rules.md` BR-06 is updated from **Unknown** to **Verified**, recording that
      production Postgres is `TimeZone = UTC`, `enrollDate` is always the `CURRENT_TIMESTAMP`
      default, and the boundary therefore lands at Bangkok midnight on 1 October.
- [ ] `docs/database.md:372` and `docs/handover.md:58` are corrected — both currently state that
      timezone correctness is unresolved.
- [ ] Bulk-imported `Enrolls` rows are checked once against the Oct-1 window, since their dates come
      from CSV rather than `CURRENT_TIMESTAMP` and fall outside the verified chain. Result recorded
      in the test report.
- [ ] `docs/testing.md` updated only where this work changes what is actually known.
- [ ] Focused tests pass; integration tests pass or are reported as skipped with the reason.

## Technical Notes

The parity assertions matter more than usual. The compatibility criterion is "zero response change
when `fiscalYear` is omitted", and the resolver refactor touches sixteen call sites indirectly.
Parity is the evidence for that claim, not a formality.

Follow existing conventions in `src/service/*.integration.test.ts`, including
`factory-pagination.integration.test.ts:157`, which already exercises `getFiscalYear()`.

**Record what is true, not what is tidier.** BR-06 *does* now become Verified — but only for the
boundary interpretation, and only because production Postgres was confirmed UTC at Checkpoint 1 of
`fiscal-year-resolver`. State the evidence, not just the verdict.

What does **not** improve: BR-07 remains application-only, so duplicate enrollments within a year
stay possible and `.limit(1)` stays arbitrary in that case. Fiscal-year identity is still re-derived
per read rather than stored, so correctness continues to depend on the API container's `TZ` — the
resolver removes the host-clock half of that dependency, not the storage half. Demonstrate these
limitations rather than papering over them.

No load or performance benchmarking. The performance criterion is "no regression", and the predicate
shape is unchanged.

## Dependencies

- fiscal-year-resolver
- fiscal-year-read-addressing

## Source Stories

- `006-fiscal-year-boundary-coverage` (Must)
