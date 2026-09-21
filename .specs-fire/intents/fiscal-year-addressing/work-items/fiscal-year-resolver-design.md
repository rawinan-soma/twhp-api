---
work_item: fiscal-year-resolver
intent: fiscal-year-addressing
created: 2026-08-21T12:20:00Z
mode: validate
checkpoint_1: approved
---

# Design: Parameterised, deterministic fiscal-year resolver

## Summary

Turn `getFiscalYear()` from an ambient, host-local, twice-read-the-clock derivation into a pure
function of an optional Common Era year, with boundaries resolved explicitly in `Asia/Bangkok`. Add
the shared `fiscalYear` query schema.

No behaviour change under deployed configuration — measured, not assumed.

Because this intent persists no fiscal-year column, this resolver **is** the fiscal-year contract for
the whole system. Every historical read that ever runs derives its boundary here.

## Scope

**In Scope:**
- `utilities().getFiscalYear(fiscalYear?)` — parameterised, single clock read, timezone-pinned
- `getFiscalYearOf(instant)` — which fiscal year contains a given instant
- `FiscalYearQuery` TypeBox schema
- Contract tests: boundaries, leap years, timezone independence, range rejection

**Out of Scope:**
- Threading the parameter into routes and services → `fiscal-year-read-addressing`
- Any write path → `past-year-write-authority`
- Any database schema change — no column, index, constraint, or enum value
- Buddhist Era conversion — the frontend owns it (`fiscalYear + 543`)

## Findings from Investigation

**1. It is 14 production call sites, not 16.** The requirements' figure counted the definition line
in `src/utils.ts:54` plus the single test call site. Actual production consumers: `enroll` ×4,
`answer` ×5, `cover` ×2, `score` ×2, `factory` ×1. The acceptance criterion must say 14, or it is
untestable as written.

**2. No time-injection parameter is needed.** The work item asserts boundary tests are impossible
without one. `bun:test` ships `setSystemTime` — verified present, Bun 1.3.6. Tests control the clock
globally, so production keeps a clean signature with no test-only argument.

**3. Timezone pinning protects correctness that currently holds by coincidence.** Same instant,
current implementation, four host timezones:

| Host `TZ` | FY2026 boundary | |
|-----------|-----------------|---|
| `Asia/Bangkok` (production) | `2025-09-30T17:00:00.000Z` | correct |
| `UTC` | `2025-10-01T00:00:00.000Z` | 7h late |
| `America/New_York` | `2025-10-01T04:00:00.000Z` | 11h late |
| `Pacific/Kiritimati` | `2025-09-30T10:00:00.000Z` | 7h early |

Correctness depends on two container settings agreeing, and that dependency is recorded nowhere.

## Verified Facts

```
production Postgres TimeZone ......... UTC          (confirmed by user, 2026-08-21)
local Postgres pg_settings source .... configuration file -> UTC
per-database / per-role override ..... none / none
TZ or PGTZ in docker.env ............. none
postgres service profiles ............ [dev, production, staging]  <- one definition, all three
api / api-dev container TZ ........... Asia/Bangkok  (docker-compose.yaml:30, :80)
enroll_date column type .............. timestamp without time zone
code that sets enrollDate explicitly.. none - schema default CURRENT_TIMESTAMP only
```

Chain: `enroll_date` <- `CURRENT_TIMESTAMP` <- TimeZone UTC, therefore stored as UTC wall-clock.
Boundary `2025-09-30T17:00Z` equals Bangkok `2025-10-01 00:00`.

**The production fiscal-year boundary lands exactly at Bangkok midnight on 1 October.**

This resolves `docs/business-rules.md` BR-06 from **Unknown** to **Verified**.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test time control | `bun:test` `setSystemTime` | Verified available. Keeps a test-only parameter out of the production signature; Bun-native per project standard |
| Timezone strategy | Fixed `+07:00` offset constant | Thailand has been UTC+7 since 1920, with no DST ever. `Intl.DateTimeFormat` adds cost for a zone that has never shifted |
| Boundary construction | `Date.UTC(y, 9, 1) - 7h` | Yields `2025-09-30T17:00Z` — provably identical to today under production `TZ`, and confirmed correct against a UTC database |
| "Current year" derivation | Bangkok wall-clock of the single clock read | Host `getFullYear()` would reintroduce the dependency being removed |
| Clock reads | Exactly one, at entry | Eliminates the `src/utils.ts:55-56` rollover race |
| Return shape | Unchanged `{ fiscalYearStart, fiscalYearEnd }` as `Date` | All 14 consumers call only `.toISOString()`; any change ripples everywhere |
| Access path | Stays `utilities().getFiscalYear()` | Zero churn at call sites |
| Invalid year | Throw `RangeError` | Programmer error, not user input — routes validate first via the query schema |
| Query schema location | New `src/schema/fiscal-year.ts` | `pagination.ts` is about pagination; follows the domain-file convention |
| Accepted range | 2000–2100 | Bounded, so an out-of-range value never reaches date arithmetic as `Invalid Date` |

## Data Models Affected

**None.** No column, index, constraint, or enum value. No migration. No backfill. No cutover step.

## Technical Approach

### Architecture

```
                    +- getFiscalYear(year?) -------------------+
  route - fiscalYear|   year ?? fiscalYearOf(new Date())  <--- one clock read
   (TypeBox)        |            |                            |
                    |            v                            |
                    |   boundary(fy-1) .. boundary(fy)        |
                    |   Date.UTC(y,9,1) - 7h                  |
                    +------------+----------------------------+
                                 v
                    { fiscalYearStart, fiscalYearEnd }
                                 |  .toISOString()
                                 v
                    gte/lt(enrolls.enroll_date, ...)   <- 14 call sites, unchanged
```

```ts
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;   // Thailand: UTC+7 since 1920, no DST

const boundary = (y: number) => new Date(Date.UTC(y, 9, 1) - BANGKOK_OFFSET_MS);

const fiscalYearOf = (instant: Date) => {
  const bkk = new Date(instant.getTime() + BANGKOK_OFFSET_MS);
  return bkk.getUTCMonth() >= 9 ? bkk.getUTCFullYear() + 1 : bkk.getUTCFullYear();
};
```

### Prototype Results

Run under four host timezones before approval:

```
TZ=Asia/Bangkok        new 2025-09-30T17:00Z -> 2026-09-30T17:00Z   MATCH LEGACY: true
TZ=UTC                 new 2025-09-30T17:00Z   (legacy drifts +7h)
TZ=America/New_York    new 2025-09-30T17:00Z   (legacy drifts +11h)
TZ=Pacific/Kiritimati  new 2025-09-30T17:00Z   (legacy drifts -7h)

FY of 2026-09-30 23:59:59.999 BKK = 2026
FY of 2026-10-01 00:00:00.000 BKK = 2027
leap FY2024 = 2023-09-30T17:00Z -> 2024-09-30T17:00Z
```

### API Changes

None in this work item. The `FiscalYearQuery` schema is created here but attached to routes by
`fiscal-year-read-addressing`.

### Database Changes

None.

## Dependencies

- None. This is the foundation work item; every other item in the intent consumes it.

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `src/utils.ts` | Modify | Rewrite `getFiscalYear`; add `getFiscalYearOf`; add offset constant |
| `src/schema/fiscal-year.ts` | Create | `FiscalYearQuery` TypeBox schema |
| `src/utils.fiscal-year.test.ts` | Create | Contract tests: boundaries, leap years, TZ independence, range rejection |
| `src/schema/fiscal-year.test.ts` | Create | Coercion and rejection tests |

## Security Considerations

- **No user input reaches date arithmetic unvalidated**: the query schema bounds the year to
  2000–2100 before it reaches the resolver. An unbounded value would produce `Invalid Date` and
  surface as an empty page rather than a 400.
- **No scope widening**: this work item touches no authorization path. The resolver is pure and
  carries no identity.

## Integration Points

| System | Type | Purpose |
|--------|------|---------|
| PostgreSQL | Read (indirect) | Boundaries are serialised with `.toISOString()` and compared against `Enrolls.enroll_date`. No DDL, no query change in this work item |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Boundary shifts for live current-year queries | High — silent data-set change | Prototype proves byte-identical output under `TZ=Asia/Bangkok`. Lock it with a regression test |
| Bulk-imported `Enrolls` rows carry CSV dates, not `CURRENT_TIMESTAMP` | Medium — provenance outside the verified chain | Run the Oct-1-window query once; an empty result proves nothing existing can be reclassified. Record in the test report |
| Thailand adopts DST | Very low | The constant is isolated and commented; a swap to `Intl` is a one-function change |
| `setSystemTime` leaks between tests | Medium — unexplained failures elsewhere | Reset in `afterEach`; never set it in the shared `src/test/setup.ts` preload |
| FY labelled by start year instead of end year | High — mislabels every historical read | Assert FY2026 = 2025-10-01 -> 2026-09-30 as the first test written |

**Pre-existing issue found**: `factory-pagination.integration.test.ts:159-160` builds
`new Date(fiscalYearStart.getFullYear() - 1, 9, 1)` — host-local construction, already TZ-fragile.
Not this work item's to fix; flagged so `fiscal-year-boundary-tests` inherits it knowingly.

## Implementation Checklist

- [x] Verify the production Postgres timezone — **UTC, confirmed 2026-08-21**
- [ ] Add `BANGKOK_OFFSET_MS`, `boundary`, and `getFiscalYearOf` to `src/utils.ts`
- [ ] Rewrite `getFiscalYear(fiscalYear?: number)` — single clock read, `RangeError` on invalid input
- [ ] Assert FY2026 = 2025-10-01 -> 2026-09-30 **first**, before anything else
- [ ] Regression test: byte-identical to legacy output under `TZ=Asia/Bangkok`
- [ ] Boundary tests at Sep 30 23:59:59.999 and Oct 1 00:00:00.000 Bangkok via `setSystemTime`
- [ ] Leap-year and TZ-independence tests (`UTC` and `Asia/Bangkok`)
- [ ] Create `src/schema/fiscal-year.ts` — `t.Numeric`, `multipleOf: 1`, range 2000–2100
- [ ] Schema tests: coercion; fractional, non-numeric, and out-of-range rejection
- [ ] Confirm all **14** production call sites compile and pass unedited
- [ ] Biome check — report baseline versus introduced findings

## Downstream Consequences

- `fiscal-year-boundary-tests` was scoped to *record* BR-06 as Unknown. It must now **resolve** it to
  Verified in `docs/business-rules.md`, and correct `docs/database.md:372` and `docs/handover.md:58`,
  which both still state that timezone correctness is unresolved.
- The intent brief's "Accepted Limitations" is softened: the boundary interpretation is verified
  correct. What remains is that identity is re-derived per read rather than stored — and this work
  item removes the API-side half of that dependency.

---
*Generated by specs.md - fabriqa.ai FIRE Flow | Checkpoint 1 approved: 2026-08-21T12:20:00Z*
