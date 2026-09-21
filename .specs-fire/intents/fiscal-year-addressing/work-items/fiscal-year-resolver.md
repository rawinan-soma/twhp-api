---
id: fiscal-year-resolver
title: Parameterised, deterministic fiscal-year resolver
intent: fiscal-year-addressing
complexity: high
mode: validate
status: completed
depends_on: []
created: 2026-08-20T09:10:00Z
design_doc: fiscal-year-resolver-design.md
checkpoint_1: approved
migrated_from: memory-bank/bolts/029-fiscal-year-reads
run_id: run-twhp-elysia-001
completed_at: 2026-08-21T12:37:49.551Z
---

# Work Item: Parameterised, deterministic fiscal-year resolver

## Description

Establish the fiscal-year contract for the whole system: a resolver that accepts a target Common Era
year and returns its window, plus the shared query parameter that carries one from the wire.

Replace the ambient, host-local, twice-read-the-clock derivation in `src/utils.ts:54-64` with a
parameterised, single-clock, `Asia/Bangkok`-pinned resolver — without editing any of its **14
production callers**.

This carries more weight than its size suggests. Because the intent persists no fiscal-year column,
**this resolver is the fiscal-year contract**: every historical read that ever runs derives its
boundary here.

## Acceptance Criteria

- [ ] `getFiscalYear(2026)` returns `[2025-10-01T00:00 +07, 2026-10-01T00:00 +07)`.
- [ ] `getFiscalYear()` with no argument returns the current fiscal year, and all **14 production
      call sites** compile and pass **without edit**. (The requirements said 16; that figure counted
      the definition line and the one test call site. Corrected at Checkpoint 1.)
- [ ] Exactly one clock read per resolution; the two-`new Date()` race (`src/utils.ts:55-56`) is gone.
- [ ] Results are identical under `TZ=UTC` and `TZ=Asia/Bangkok`.
- [ ] A helper returns the Common Era fiscal year containing a given instant.
- [ ] A non-integer or out-of-range year fails explicitly, never as a silently malformed window.
- [ ] The return shape `{ fiscalYearStart, fiscalYearEnd }` is unchanged.
- [ ] A shared `fiscalYear` query schema exists: `t.Numeric`, `multipleOf: 1`, declared range,
      optional, composing alongside `PaginationQuery` without either being redefined.
- [ ] A malformed `fiscalYear` is rejected by the existing `VALIDATION` 400 flow before any query runs.
- [ ] OpenAPI describes `fiscalYear` as Common Era, omitted-means-current.
- [ ] No database schema change of any kind.

## Technical Notes

The canonical definition is normative: fiscal year `Y` is labelled by its **ending** year. Assert
FY2026 = 2025-10-01 → 2026-09-30 directly, before anything consumes the resolver. An off-by-one here
mislabels every historical read in the system and nothing downstream would catch it.

**Superseded at Checkpoint 1**: this work item originally required a time-injection parameter, on the
premise that boundary assertions were otherwise impossible. That premise was wrong. `bun:test` ships
`setSystemTime` (verified, Bun 1.3.6), so tests control the clock globally and the production
signature stays free of a test-only argument. See the design doc.

Pinning to `Asia/Bangkok` is a no-op under deployed configuration, and this was **measured, not
assumed**: a prototype produced byte-identical output to the legacy implementation under
`TZ=Asia/Bangkok`, and stable correct output under `UTC`, `America/New_York`, and
`Pacific/Kiritimati`, where the legacy code drifts by 7–11 hours.

Production Postgres was confirmed `TimeZone = UTC` on 2026-08-21, and no production code sets
`enrollDate` explicitly — it is always the `CURRENT_TIMESTAMP` default. The boundary therefore lands
exactly at Bangkok midnight on 1 October today. This resolves `docs/business-rules.md` BR-06.

Keep the return shape. Callers pass these values to `.toISOString()` against a `timestamp without
time zone` column; changing the shape would ripple into all sixteen sites and defeat the zero-churn
criterion.

Follow `src/schema/pagination.ts` for the query schema, including its reasoning: `t.Numeric` not
`t.Number` because query values arrive as strings, and `multipleOf: 1` because `t.Numeric` maps to
JSON-schema `number`. Declare a range — unbounded input reaching `new Date(year, ...)` produces
`Invalid Date` rather than an error, surfacing as an empty page instead of a 400.

**Design doc**: `fiscal-year-resolver-design.md` — Checkpoint 1 approved 2026-08-21.

## Dependencies

(none) — foundation work item. Everything else in this intent consumes it.

## Source Stories

- `001-fiscal-year-resolver` (Must)
- `002-fiscal-year-query-contract` (Must)
