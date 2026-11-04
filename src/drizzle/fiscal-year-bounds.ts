/**
 * Bounds of a valid Common Era fiscal year. Declared in the database layer so the schema's CHECK
 * constraint on `Awards.fiscal_year` and the request-validation layer share one value without the
 * database layer importing from the DTO layer. `src/schema/fiscal-year.ts` re-exports them.
 */
export const FISCAL_YEAR_MIN = 2000;
export const FISCAL_YEAR_MAX = 2100;
