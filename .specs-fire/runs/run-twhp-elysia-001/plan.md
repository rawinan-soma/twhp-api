---
run: run-twhp-elysia-001
work_item: fiscal-year-resolver
intent: fiscal-year-addressing
mode: validate
checkpoint: plan
approved_at: null
---

# Implementation Plan: Parameterised, deterministic fiscal-year resolver

## Approach

Four steps, in this order:

1. **Add the primitives** to `src/utils.ts` as module-level consts above `export const utilities`,
   alongside the existing `uploadFile` / `deleteFile` helpers: `BANGKOK_OFFSET_MS`, `fiscalYearBoundary`,
   and `getFiscalYearOf`. These are pure functions with no dependency on `env` or `minioClient`.
2. **Rewrite `getFiscalYear`** inside the `utilities()` object literal (`src/utils.ts:54-64`) to take
   an optional CE year. Keep it as a property of `utilities()` so the access path
   `utilities().getFiscalYear()` is untouched at all 14 production call sites.
3. **Write the contract tests first for the labelling rule**, then the rest. The FY2026 assertion
   goes in before any other test, because an off-by-one there is the one failure nothing downstream
   would catch.
4. **Add the query schema** in a new `src/schema/fiscal-year.ts`, mirroring `src/schema/pagination.ts`
   in structure, naming, and comment style.

`getFiscalYearOf` is exported at module level **and** surfaced on `utilities()`. Work items
`fiscal-year-read-addressing` (response field) and `factory-grace-window` (window predicate) both
need it, and the project convention is that services reach helpers through `utilities()`.

## Files to Create

| File | Purpose |
|------|---------|
| `src/schema/fiscal-year.ts` | `FiscalYearQuery` TypeBox schema — optional CE year, `t.Numeric`, `multipleOf: 1`, range 2000–2100 |
| `src/utils.fiscal-year.test.ts` | Resolver contract tests: labelling, boundaries, leap year, TZ independence, range rejection, legacy parity |
| `src/schema/fiscal-year.test.ts` | Schema tests: string coercion, fractional/non-numeric/out-of-range rejection |

## Files to Modify

| File | Changes |
|------|---------|
| `src/utils.ts` | Add `BANGKOK_OFFSET_MS`, `fiscalYearBoundary`, `getFiscalYearOf` at module level; rewrite `getFiscalYear` (lines 54-64) to accept `fiscalYear?: number`; expose `getFiscalYearOf` on `utilities()` |

**No other file is touched.** The 14 production call sites are not edited — that is an acceptance
criterion, not an aspiration.

## Tests

| Test File | Coverage |
|-----------|----------|
| `src/utils.fiscal-year.test.ts` | FY2026 = 2025-10-01 → 2026-09-30 (**written first**); boundary at Sep 30 23:59:59.999 and Oct 1 00:00:00.000 BKK via `setSystemTime`; leap year FY2024; identical output under `TZ=UTC` and `TZ=Asia/Bangkok`; byte-identical parity with the legacy algorithm under `TZ=Asia/Bangkok`; `RangeError` on non-integer and out-of-range input; single clock read |
| `src/schema/fiscal-year.test.ts` | `"2026"` coerces to `2026`; `2026.5` rejected; `"abc"` rejected; `1999` and `2101` rejected; omitted value passes as `undefined` |

Existing suite must still report **357 pass / 0 fail** (baseline `.specs-fire/baseline-2026-08-21.md`).

## Technical Details

### Primitives

```ts
// Thailand has been UTC+7 since 1920 and has never observed DST.
// Pinned here so the fiscal-year boundary does not depend on the host's TZ.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

const FISCAL_YEAR_MIN = 2000;
const FISCAL_YEAR_MAX = 2100;

/** Instant of 1 October 00:00 Bangkok time in year `y`. */
const fiscalYearBoundary = (y: number) => new Date(Date.UTC(y, 9, 1) - BANGKOK_OFFSET_MS);

/** The CE fiscal year whose window contains `instant`. FY is labelled by its ENDING year. */
const getFiscalYearOf = (instant: Date) => {
  const bkk = new Date(instant.getTime() + BANGKOK_OFFSET_MS);
  return bkk.getUTCMonth() >= 9 ? bkk.getUTCFullYear() + 1 : bkk.getUTCFullYear();
};
```

### Resolver

```ts
getFiscalYear: (fiscalYear?: number) => {
  const year = fiscalYear ?? getFiscalYearOf(new Date());   // exactly one clock read

  if (!Number.isInteger(year) || year < FISCAL_YEAR_MIN || year > FISCAL_YEAR_MAX) {
    throw new RangeError(
      `fiscalYear must be an integer between ${FISCAL_YEAR_MIN} and ${FISCAL_YEAR_MAX}, got: ${fiscalYear}`,
    );
  }

  return {
    fiscalYearStart: fiscalYearBoundary(year - 1),
    fiscalYearEnd: fiscalYearBoundary(year),
  };
},
```

Return shape unchanged: two `Date` objects. Every consumer calls only `.toISOString()`.

### Query schema

```ts
// src/schema/fiscal-year.ts
export const FiscalYearQuery = t.Object({
  fiscalYear: t.Optional(
    t.Numeric({
      minimum: 2000,
      maximum: 2100,
      multipleOf: 1,
      description:
        "Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 – 30 Sep 2026). " +
        "Omit for the current fiscal year. The client renders Buddhist Era as this value + 543.",
    }),
  ),
});
export type FiscalYearQueryDto = Static<typeof FiscalYearQuery>;
```

`t.Numeric` not `t.Number` because query values arrive as strings. `multipleOf: 1` because
`t.Numeric` maps to JSON-schema `number`, so `?fiscalYear=2026.5` would otherwise validate. The
`minimum`/`maximum` bounds exist so an absurd value never reaches `Date.UTC` and become `Invalid Date`,
which would surface as an empty page instead of a 400.

### Test approach

`setSystemTime` from `bun:test` controls the clock. Reset it in `afterEach` — never in the shared
`src/test/setup.ts` preload, which would leak into all 18 existing test files.

The legacy-parity test inlines the old algorithm verbatim and asserts both `.toISOString()` values
match under `TZ=Asia/Bangkok`. This is the evidence for the no-behaviour-change claim, and it lives
in the suite rather than depending on anyone remembering to re-check a container.

TZ independence is asserted by running the suite under both `TZ=UTC` and `TZ=Asia/Bangkok`:

```bash
TZ=UTC bun test src/utils.fiscal-year.test.ts
TZ=Asia/Bangkok bun test src/utils.fiscal-year.test.ts
```

## Based on Design Doc

Reference: `.specs-fire/intents/fiscal-year-addressing/work-items/fiscal-year-resolver-design.md`
(Checkpoint 1 approved 2026-08-21)

## Out of Scope for This Run

- Attaching `FiscalYearQuery` to any route — `fiscal-year-read-addressing`
- Any service or query change — the 14 call sites keep calling `getFiscalYear()` with no argument
- Correcting `docs/business-rules.md` BR-06 — `fiscal-year-boundary-tests`
- The pre-existing TZ fragility in `factory-pagination.integration.test.ts:159-160`

---
*Plan approved at checkpoint. Execution follows.*
