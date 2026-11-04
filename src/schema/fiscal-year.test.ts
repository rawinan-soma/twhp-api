import { describe, expect, it } from "bun:test";
import { Elysia, t } from "elysia";
import { FiscalYearQuery } from "./fiscal-year";
import { LIMIT_MAX, PaginationQuery } from "./pagination";

/**
 * Query values arrive as strings, so coercion is part of the contract and must be exercised through
 * Elysia's own validation — `t.Numeric` is an Elysia type and raw TypeBox `Value.Check` does not
 * understand it. This mirrors the approach in src/service/pagination.test.ts.
 *
 * The rejection cases matter most. An out-of-range year reaching `Date.UTC` produces an
 * `Invalid Date`, which would surface to the caller as an empty page rather than a 400.
 */

const EXPECTED_CODES = new Set(["VALIDATION", "INVALID_FILE_TYPE", "PARSE"]);

const app = new Elysia()
  .onError(({ code, set }) => {
    if (EXPECTED_CODES.has(code as string)) {
      set.status = 400;
      return { message: "validation" };
    }
    set.status = 500;
    return { message: "unexpected" };
  })
  // The composition shape a real route uses: existing filters + FiscalYearQuery.
  .get("/list", ({ query }) => ({ query }), {
    query: t.Composite([t.Object({ region: t.Optional(t.Numeric()) }), FiscalYearQuery]),
  });

const get = (qs: string) => app.handle(new Request(`http://localhost/list${qs}`));

/** The real composition a paginated staff list route will use: filters + pagination + fiscal year. */
const paginated = new Elysia()
  .onError(({ code, set }) => {
    if (EXPECTED_CODES.has(code as string)) {
      set.status = 400;
      return { message: "validation" };
    }
    set.status = 500;
    return { message: "unexpected" };
  })
  .get("/paged", ({ query }) => ({ query }), {
    query: t.Composite([
      t.Object({ region: t.Optional(t.Numeric()) }),
      PaginationQuery,
      FiscalYearQuery,
    ]),
  });

const getPaged = (qs: string) => paginated.handle(new Request(`http://localhost/paged${qs}`));

describe("FiscalYearQuery — accepts", () => {
  it("coerces a numeric string to a number", async () => {
    const res = await get("?fiscalYear=2026");
    const body = (await res.json()) as { query: { fiscalYear: number } };

    expect(res.status).toBe(200);
    expect(body.query.fiscalYear).toBe(2026);
  });

  it("allows the parameter to be omitted entirely", async () => {
    expect((await get("")).status).toBe(200);
  });

  it.each([2000, 2026, 2100])("accepts in-range year %d", async (year) => {
    expect((await get(`?fiscalYear=${year}`)).status).toBe(200);
  });

  it("composes with PaginationQuery without either schema being redefined", async () => {
    const res = await getPaged("?page=2&limit=10&fiscalYear=2026&region=5");
    const body = (await res.json()) as {
      query: { page: number; limit: number; fiscalYear: number; region: number };
    };

    expect(res.status).toBe(200);
    expect(body.query).toMatchObject({ page: 2, limit: 10, fiscalYear: 2026, region: 5 });
  });

  it("leaves PaginationQuery's own bounds intact when composed", async () => {
    // limit > LIMIT_MAX must still be rejected by PaginationQuery, not silently widened.
    expect((await getPaged(`?limit=${LIMIT_MAX + 1}&fiscalYear=2026`)).status).toBe(400);
    expect((await getPaged(`?limit=${LIMIT_MAX}&fiscalYear=2026`)).status).toBe(200);
  });

  it("composes with an existing filter without disturbing it", async () => {
    const res = await get("?region=5&fiscalYear=2026");
    const body = (await res.json()) as { query: { region: number; fiscalYear: number } };

    expect(res.status).toBe(200);
    expect(body.query.region).toBe(5);
    expect(body.query.fiscalYear).toBe(2026);
  });
});

describe("FiscalYearQuery — rejects", () => {
  it("rejects a fractional year, which would otherwise reach the date arithmetic", async () => {
    expect((await get("?fiscalYear=2026.5")).status).toBe(400);
  });

  it("rejects a non-numeric value", async () => {
    expect((await get("?fiscalYear=abc")).status).toBe(400);
  });

  it.each([1999, 2101, 999999])("rejects out-of-range year %d", async (year) => {
    expect((await get(`?fiscalYear=${year}`)).status).toBe(400);
  });

  it("rejects a negative year", async () => {
    expect((await get("?fiscalYear=-2026")).status).toBe(400);
  });
});
