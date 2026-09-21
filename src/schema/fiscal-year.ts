import { type Static, t } from "elysia";
import { FISCAL_YEAR_MAX, FISCAL_YEAR_MIN } from "../drizzle/fiscal-year-bounds";

/**
 * Shared fiscal-year addressing contract for the fiscal-scoped read endpoints.
 *
 * A fiscal year is the half-open interval [Oct 1 of Y-1 00:00, Oct 1 of Y 00:00) in Asia/Bangkok,
 * labelled by its ENDING Common Era year: FY2026 runs 2025-10-01 to 2026-09-30. Resolution is
 * performed by `utilities().getFiscalYear()` in src/utils.ts — no route or service constructs
 * fiscal-year boundaries itself.
 *
 * The API is Common Era on both sides of the wire. Buddhist Era is a presentation concern owned by
 * the client, which renders `fiscalYear + 543` (FY2026 -> พ.ศ. 2569). No BE value ever crosses this
 * boundary in either direction.
 *
 * Omitting the parameter selects the current fiscal year, so every pre-existing caller keeps its
 * present behaviour byte-for-byte.
 */

// Declared in the database layer (the Awards CHECK constraint needs them); re-exported so every
// existing importer keeps this module as its entry point.
export { FISCAL_YEAR_MAX, FISCAL_YEAR_MIN };

/**
 * Compose into a route's existing query schema with `t.Composite`; do not replace it, so existing
 * filters and pagination keep their declarations and their OpenAPI documentation.
 *
 * `t.Numeric` (not `t.Number`) because query values arrive as strings and need coercion.
 * `multipleOf: 1` is required: `t.Numeric` maps to JSON-schema `number`, so without it a fractional
 * `?fiscalYear=2026.5` validates and reaches the date arithmetic.
 * The `minimum`/`maximum` bounds are a correctness control, not a policy limit — an unbounded value
 * reaching `Date.UTC` yields `Invalid Date`, which would surface as an empty page instead of a 400.
 */
export const FiscalYearQuery = t.Object({
  fiscalYear: t.Optional(
    t.Numeric({
      minimum: FISCAL_YEAR_MIN,
      maximum: FISCAL_YEAR_MAX,
      multipleOf: 1,
      description:
        "Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). " +
        "Omit for the current fiscal year. Clients render Buddhist Era as this value + 543.",
    }),
  ),
});

export type FiscalYearQueryDto = Static<typeof FiscalYearQuery>;
