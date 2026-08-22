---
id: fiscal-year-addressing
title: Fiscal Year Addressing
status: completed
created: 2026-08-20T09:10:00Z
migrated_from: memory-bank/intents/013-fiscal-year-addressing
completed_at: 2026-08-22T15:50:03.858Z
---

# Intent: Fiscal Year Addressing

## Goal

Make the fiscal year an explicit dimension of the TWHP API — readable for any nominated year, and
selectively writable for closed years — entirely within the application layer, with no database
schema change.

Today `utilities().getFiscalYear()` (`src/utils.ts:54-64`) derives the current Oct 1 – Oct 1 window
on every request, and sixteen call sites across `enroll`, `cover`, `answer`, `score`, and `factory`
consume it without argument. Nothing can address another year, in either direction, on any path.

## Users

- **Factory** — reads its own history for any fiscal year; gains a 31-day window
  (2026-10-01 → 2026-10-31) to finish a prior-year Cover that never reached `finished`. The actor
  this intent primarily exists to protect.
- **DOED Admin** (`Role.DOED`) — reads nationally; holds non-expiring authority to write any year.
- **Evaluator at level ODPC** — reads region-scoped; holds non-expiring authority to write past
  years within its existing region. The only actor distinguished by evaluator *level* rather than
  role, which no current guard can express.
- **Evaluator at level Mental or DOH** — reads region-scoped; explicitly denied past-year writes.
- **Provincial Officer** — reads province-scoped; no past-year writes.
- **Frontend client** — sends `fiscalYear`, and owns Buddhist Era presentation (`fiscalYear + 543`).

## Problem

At 2026-10-01 the window advances and every prior-year row becomes unreachable through every read
path. Factories receive `no enrollment found` / 404; staff lists return `meta.total: 0`. Nothing is
deleted — it simply cannot be addressed.

Worse, every write path is current-year-scoped too, so work left unfinished at the boundary cannot
be completed by anyone. The originating concern is concrete, not hypothetical: some Factories and
evaluators are known to be incomplete for FY2026 with under six weeks remaining.

There is no rollover job, archival step, or flag anywhere in the system. The only scheduled job is
the 08:30 daily mail (`src/workers.ts:9`).

## Success Criteria

- On 2026-10-01, every role's list and detail endpoints return FY2026 data when addressed; no
  endpoint that worked on Sep 30 returns 404 or empty for the same logical resource.
- A Factory at `in_progress` on Oct 1 can submit through 2026-10-31; DOED and ODPC can review and
  score FY2026 Covers with no expiry.
- Fiscal-year derivation is deterministic and host-independent: one clock read per resolution,
  identical results under `TZ=UTC` and `TZ=Asia/Bangkok`.
- Every role can address any past fiscal year and receives exactly the rows its current-year scope
  would have granted.
- Zero response changes for any caller that omits `fiscalYear`.
- Delivered before 2026-10-01.

## Constraints

- **No database schema changes** — no columns, indexes, constraints, or enum values. Fiscal year
  stays derived at query time from `Enrolls.enroll_date`. Decided 2026-08-20.
- **Canonical definition (normative)**: fiscal year `Y` is `[Oct 1 of Y-1 00:00, Oct 1 of Y 00:00)`
  in `Asia/Bangkok`, labelled by its **ending** Common Era year. FY2026 = 2025-10-01 → 2026-09-30.
  The API is Common Era on both sides of the wire; BE never crosses it.
- `evaluatorLevels` (`Mental` | `DOH` | `ODPC`) is a column on `Evaluators`, not a `Role`. `Role`
  has exactly four values. No existing guard can express the ODPC distinction.
- `coverStatus` is a fixed pgEnum (`finished` | `in_progress` | `in_review`), so no `expired` state
  is available and none is invented.
- The 2026-10-01 boundary is externally fixed and cannot be moved.
- Standard project constraints apply: no direct `main` commits, no direct migration edits, services
  return `status(code, body)`, file I/O outside DB transactions.

## Accepted Limitations

Recorded deliberately, not overlooked. Each follows from the no-schema-change constraint:

- **BR-06 is now `Verified`, not Unknown** (updated 2026-08-21). Production Postgres was confirmed
  `TimeZone = UTC`, and no production code sets `enrollDate` explicitly — it is always the
  `CURRENT_TIMESTAMP` default. The boundary `2025-09-30T17:00Z` therefore lands exactly at Bangkok
  midnight on 1 October. What remains is narrower than first assumed: identity is still **re-derived
  per read** rather than stored, so correctness depends on configuration holding. `fiscal-year-resolver`
  removes the host-clock half of that dependency by pinning the offset in code.
- **BR-07 stays application-only.** No unique index on `(factory_id, fiscal_year)` is possible
  without a stored column, so duplicate enrollments within a year remain possible and `.limit(1)`
  owner lookups stay arbitrary in that case.
- **Fiscal filters remain sequential scans.** This is status quo, not a regression: `Enrolls`
  carries only `enrolls_id_key` on the primary key (`src/drizzle/schema.ts:229`) — no `enroll_date`
  or `factory_id` index exists today.
- **Historical region derives from a Factory's *current* location**, because `provinces` and
  `districts` join through `factories`. A relocated Factory changes the apparent region of a closed
  year — and in work item `past-year-write-authority` this affects authorization, not only
  visibility.

## Notes

Migrated from AI-DLC intent `013-fiscal-year-addressing` on 2026-08-20. The source artifacts —
requirements (8 FRs, 5 NFR groups), system context, 2 units, 12 stories, and 6 planned bolts — remain
at `memory-bank/intents/013-fiscal-year-addressing/` and `memory-bank/bolts/029-034/` as the
authoritative record of how these decisions were reached.

The six bolts map 1:1 onto the six work items here, since a bolt is already an execution session and
FIRE requires a work item to be completable in a single run. The 12 stories fold in as acceptance
criteria.

**Trim point**: the first three work items (`fiscal-year-resolver`, `fiscal-year-read-addressing`,
`fiscal-year-boundary-tests`) constitute the addressing capability and are wholly additive. Shipped
alone they prevent the 2026-10-01 blackout. The last three add continuity and carry the intent's
authorization risk. Continuity alone would not be deliverable, since addressing must exist before
out-of-year writes can target anything.
