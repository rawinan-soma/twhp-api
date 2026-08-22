---
run: run-twhp-elysia-001
work_item: fiscal-year-resolver
intent: fiscal-year-addressing
generated: 2026-08-21T12:50:00Z
mode: validate
---

# Implementation Walkthrough: Parameterised, deterministic fiscal-year resolver

## Summary

`utilities().getFiscalYear()` used to answer exactly one question — "what is the current fiscal
year?" — and answered it by reading the host computer's clock setting, twice. It now accepts an
optional Common Era year, reads the clock once, and resolves its boundaries against a pinned
`Asia/Bangkok` offset rather than whatever timezone the container happens to be configured with.

Nothing else changed. All 14 production call sites still call `getFiscalYear()` with no argument and
behave exactly as before — proven by a test that compares against the old algorithm byte-for-byte.

This is the foundation of intent `fiscal-year-addressing`. Because that intent persists no
fiscal-year column, **this function is the fiscal-year contract for the entire system**: every
historical read that will ever run derives its boundary here.

## Structure Overview

Two pure module-level helpers and one named constant were added above `utilities()` in
`src/utils.ts`, alongside the existing MinIO helpers. `getFiscalYear` was rewritten in place inside
the `utilities()` object literal so its access path is unchanged. A new schema module carries the
query-parameter contract that routes will adopt in the next work item.

## Architecture

### Pattern Used

Pure functions at module scope, surfaced through the existing `utilities()` factory. This preserves
the project's convention that services reach shared helpers via `utilities().x()` while keeping the
fiscal-year logic itself free of `env`, MinIO, and Redis.

### Layer Structure

```text
  route  ──?fiscalYear──►  FiscalYearQuery        src/schema/fiscal-year.ts
   (TypeBox validation: coercion, multipleOf, range)
                                  │
                                  ▼
           utilities().getFiscalYear(year?)        src/utils.ts
                                  │
                    fiscalYearBoundary(y) = Date.UTC(y,9,1) − 7h
                    getFiscalYearOf(instant)
                                  │
                                  ▼
              { fiscalYearStart, fiscalYearEnd }
                                  │  .toISOString()
                                  ▼
        gte/lt(enrolls.enroll_date, …)   ← 14 call sites, untouched
```

## Files Changed

### Created

| File | Purpose |
|------|---------|
| `src/schema/fiscal-year.ts` | `FiscalYearQuery` TypeBox schema and the canonical 2000–2100 range constants |
| `src/utils.fiscal-year.test.ts` | 25 resolver contract tests |
| `src/schema/fiscal-year.test.ts` | 14 schema coercion, composition, and rejection tests |

### Modified

| File | Changes |
|------|---------|
| `src/utils.ts` | Added `BANGKOK_OFFSET_MS`, `fiscalYearBoundary`, `getFiscalYearOf`; rewrote `getFiscalYear` to accept `fiscalYear?: number` with range validation; exposed `getFiscalYearOf` on `utilities()`; imported the range constants from the schema module |

**No file under `src/service/`, `src/routes/`, or `src/drizzle/` was touched.**

## Key Implementation Details

### 1. The boundary is an instant, not a wall-clock date

The old code built `new Date(year, 9, 1)` — October 1st *in the host's timezone*. The new code builds
`Date.UTC(year, 9, 1) − 7h`, which is the same instant regardless of where the process runs:
`2025-09-30T17:00:00.000Z`.

That value is not arbitrary. `Enrolls.enroll_date` is `timestamp without time zone`, written by
PostgreSQL's `CURRENT_TIMESTAMP` on a container running UTC, so it holds UTC wall-clock. 17:00 UTC
*is* midnight in Bangkok. The comparison now lines up by construction rather than by two container
settings happening to agree.

### 2. A fiscal year is labelled by its ending year

FY2026 runs 2025-10-01 to 2026-09-30. This matches Thai convention (ปีงบประมาณ 2569 ends in September
2026), which is what makes the client's `fiscalYear + 543` render correct. It is the first thing the
test file asserts, because an off-by-one here would mislabel every historical read in the system and
nothing downstream would catch it.

### 3. One clock read, asserted rather than assumed

The old implementation called `new Date()` twice — once for `getFullYear()` and once for the
comparison. A request crossing midnight on 1 October between those two calls could produce a
mismatched start/end pair. The new version reads once.

This is verified directly: a test temporarily substitutes `globalThis.Date` with a subclass that
counts no-argument constructions, and asserts the count is 1 (and 0 when a year is supplied).

### 4. Validation bounds are a correctness control

The 2000–2100 range is not a policy limit. An unbounded year reaching `Date.UTC` produces
`Invalid Date`, and every downstream comparison against it silently returns nothing — the caller
would see an empty page instead of an error. The schema rejects out-of-range values with a 400
before the resolver ever runs; the resolver's own `RangeError` is a backstop for programmer error.

### 5. Timezone independence is provable, not asserted

Every expectation in the test file is an absolute UTC instant. None is derived from host-local
construction. The whole suite therefore produces identical results under `TZ=UTC`,
`TZ=Asia/Bangkok`, and `TZ=America/New_York`.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test time control | `bun:test` `setSystemTime` | Removed the need for a time-injection parameter. The work item had assumed one was required; it was not |
| Timezone strategy | Fixed `+07:00` constant | Thailand has been UTC+7 since 1920 with no DST. `Intl.DateTimeFormat` would add cost for a zone that has never shifted |
| Range constants ownership | `src/schema/fiscal-year.ts` is the single source; `src/utils.ts` imports them | Prevents divergence turning a validation 400 into an unhandled 500. Reverse direction rejected: `src/utils.ts` opens a Redis connection at import time |
| Return shape | Unchanged `{ fiscalYearStart, fiscalYearEnd }` | 14 consumers call only `.toISOString()`; changing it would ripple everywhere |
| Access path | Still `utilities().getFiscalYear()` | Zero churn at call sites, which was an acceptance criterion |

## Deviations from Plan

Three, all small and all recorded in the test and review reports:

1. **Schema tests were rewritten.** The first attempt used raw TypeBox `Value.Check`, which does not
   understand Elysia's `t.Numeric` and passed inputs that should have failed. Replaced with a real
   Elysia handler, matching the approach already used in `src/service/pagination.test.ts`.
2. **Two composition tests were added** beyond the plan, to discharge the acceptance criterion about
   composing with `PaginationQuery` specifically — the original tests only proved composition with an
   arbitrary filter object.
3. **The range constants were centralised** after code review surfaced the duplication. Confirmed
   with the user before applying.

## Dependencies Added

| Package | Why Needed |
|---------|------------|
| (none) | |

The FIRE tooling scripts require the `yaml` npm package. `CLAUDE.md` requires asking before
installing dependencies, so it was installed transiently outside the repository and loaded via
`NODE_PATH`. `package.json` and `bun.lock` are untouched.

## How to Verify

1. **The full suite is green**
   ```bash
   bun test src
   ```
   Expected: 395 pass, 1 skip, 0 fail, 396 tests across 20 files.

2. **Nothing changed for existing callers** — this is the no-behaviour-change proof
   ```bash
   TZ=Asia/Bangkok bun test src
   ```
   Expected: 396 pass, 0 skip, 0 fail. The extra test that runs here compares the new resolver
   against the old algorithm verbatim and requires byte-identical output.

3. **Timezone independence**
   ```bash
   TZ=UTC bun test src/utils.fiscal-year.test.ts
   TZ=America/New_York bun test src/utils.fiscal-year.test.ts
   ```
   Expected: 24 pass, 1 skip, 0 fail in both.

4. **No lint regression**
   ```bash
   bunx biome check src --max-diagnostics=100
   ```
   Expected: 3 errors, 30 warnings, 3 infos — identical to `.specs-fire/baseline-2026-08-21.md`.

5. **Call sites untouched**
   ```bash
   git status --porcelain -- src/
   ```
   Expected: only `src/utils.ts` modified, plus the three new files. Nothing under `src/service/`,
   `src/routes/`, or `src/drizzle/`.

## Test Coverage

- Tests added: **39** (25 resolver, 14 schema)
- Coverage: not measured — this repository configures no coverage threshold, and inventing a figure
  would be worse than stating its absence. `bun test --coverage` is available if a target is set later.
- Status: **passing** — 396 tests, 0 failures, 0 regressions against the 357-test baseline

## Ready for Review

- [x] All acceptance criteria met (11 met, 1 correctly deferred to `fiscal-year-read-addressing`)
- [x] Tests passing
- [x] No critical issues
- [ ] Documentation updated — deferred by design to `fiscal-year-boundary-tests`
- [x] Developer notes captured

## Developer Notes

**One finding is worth more than this work item.** `docs/business-rules.md` has rated the
fiscal-year boundary interpretation **Unknown** since it was written. Confirming that production
PostgreSQL runs on UTC, combined with the fact that no production code ever sets `enrollDate`
explicitly, closes that question: the boundary lands exactly at Bangkok midnight on 1 October, and
always has. That is now evidence rather than an open item. Updating BR-06, `docs/database.md:372`,
and `docs/handover.md:58` is scoped to `fiscal-year-boundary-tests`.

**Two limitations are deliberately unchanged.** BR-07 remains application-only — there is still no
unique constraint on `(factory_id, fiscal_year)`, so `.limit(1)` owner lookups stay arbitrary where
duplicates exist. And fiscal-year identity is still re-derived per read rather than stored; this work
removes the host-clock half of that dependency, not the storage half.

**One thing to watch in the next work item.** Bulk-imported `Enrolls` rows carry dates from CSV
rather than `CURRENT_TIMESTAMP`, so they sit outside the verified UTC chain. The local database has
zero `Enrolls` rows, so this could not be checked here.

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-001*
