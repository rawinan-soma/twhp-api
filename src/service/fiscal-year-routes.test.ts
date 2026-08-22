import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { FISCAL_YEAR_MAX, FISCAL_YEAR_MIN, FiscalYearQuery } from "../schema/fiscal-year";

/**
 * Proves that every fiscal-scoped read endpoint COMPOSES the shared `FiscalYearQuery`.
 *
 * WHY INTROSPECTION AND NOT AN HTTP REQUEST — the same reasoning recorded in
 * `pagination-routes.test.ts`: the nine staff routes sit behind adminGuard / evalGuard /
 * officerGuard, and an unauthenticated request is answered by the guard BEFORE query validation
 * runs. A `?fiscalYear=99999` expecting 400 would assert 401 against a route with no fiscal-year
 * schema at all, and pass. Reading the registered schema has no such blind spot.
 *
 * The four Factory self-reads had NO query parameters at all before this work, so they are the most
 * likely place for a missed composition to go unnoticed. Every endpoint is asserted individually.
 */

type RouteEntry = {
  method: string;
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: Elysia does not export the type of a registered route's compiled hooks
  hooks?: { query?: any };
};

/** Every endpoint whose result set is scoped by fiscal year, and the GET path each registers. */
const FISCAL_ROUTES = [
  { name: "admins/enrolls", mod: "../routes/admins/enrolls/index", path: "" },
  { name: "admins/factories", mod: "../routes/admins/factories/index", path: "" },
  { name: "admins/score", mod: "../routes/admins/score/index", path: "" },
  { name: "evaluators/enrolls", mod: "../routes/evaluators/enrolls/index", path: "" },
  { name: "evaluators/factories", mod: "../routes/evaluators/factories/index", path: "" },
  { name: "evaluators/score", mod: "../routes/evaluators/score/index", path: "" },
  {
    name: "provincialOfficers/enrolls",
    mod: "../routes/provincialOfficers/enrolls/index",
    path: "",
  },
  {
    name: "provincialOfficers/factories",
    mod: "../routes/provincialOfficers/factories/index",
    path: "",
  },
  { name: "provincialOfficers/score", mod: "../routes/provincialOfficers/score/index", path: "" },
  { name: "factories/enrolls", mod: "../routes/factories/enrolls/index", path: "" },
  {
    name: "factories/assessments (cover)",
    mod: "../routes/factories/assessments/index",
    path: "covers",
  },
  {
    name: "factories/assessments (answers)",
    mod: "../routes/factories/assessments/index",
    path: "/answers",
  },
  {
    name: "factories/assessments/score",
    mod: "../routes/factories/assessments/score/index",
    path: "",
  },
] as const;

const routeOf = async (modPath: string, path: string): Promise<RouteEntry> => {
  // biome-ignore lint/suspicious/noExplicitAny: route modules are typed against the concrete App instance, which cannot be constructed here without booting config, Redis and MinIO
  const define = (await import(modPath)).default as (app: any) => any;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  const app = define(new Elysia() as any) as { routes: RouteEntry[] };
  // Elysia normalises registered paths (a leading slash may be added or dropped), so compare on a
  // normalised form. Still matched by method AND path, never by "the route that has the parameter"
  // — that would turn a missing schema into a skipped assertion instead of a failure.
  const norm = (v: string) => v.replace(/^\//, "");
  const entry = app.routes.find((r) => r.method === "GET" && norm(r.path) === norm(path));
  if (!entry) {
    const available = app.routes.map((r) => `${r.method} ${JSON.stringify(r.path)}`).join(", ");
    throw new Error(`no GET "${path}" registered by ${modPath}. Available: ${available}`);
  }
  return entry;
};

describe("every fiscal-scoped read endpoint composes FiscalYearQuery", () => {
  for (const route of FISCAL_ROUTES) {
    describe(route.name, () => {
      it("registers fiscalYear on its query schema", async () => {
        const { hooks } = await routeOf(route.mod, route.path);

        expect(Object.keys(hooks?.query?.properties ?? {})).toContain("fiscalYear");
      });

      it("keeps fiscalYear optional, so an omitted parameter is not a 400", async () => {
        const { hooks } = await routeOf(route.mod, route.path);
        const required: string[] = hooks?.query?.required ?? [];

        expect(required).not.toContain("fiscalYear");
      });

      it("uses the SHARED schema, not a local copy that could drift", async () => {
        const { hooks } = await routeOf(route.mod, route.path);

        // Structural identity is the direct proof of composition. A hand-rolled `fiscalYear` with
        // the same bounds would pass the checks above but keep its own bounds when the shared
        // contract changes.
        expect(JSON.stringify(hooks?.query?.properties?.fiscalYear)).toEqual(
          JSON.stringify(FiscalYearQuery.properties.fiscalYear),
        );
      });
    });
  }
});

describe("non-fiscal endpoints do NOT gain fiscalYear", () => {
  it("the question set is bounded and year-independent", async () => {
    const { hooks } = await routeOf("../routes/factories/assessments/index", "/questions");

    expect(Object.keys(hooks?.query?.properties ?? {})).not.toContain("fiscalYear");
  });
});

describe("composition does not disturb the pagination contract", () => {
  for (const route of FISCAL_ROUTES.slice(0, 9)) {
    it(`${route.name} still registers page and limit`, async () => {
      const { hooks } = await routeOf(route.mod, route.path);
      const props = Object.keys(hooks?.query?.properties ?? {});

      expect(props).toContain("page");
      expect(props).toContain("limit");
    });
  }
});

describe("FiscalYearQuery bounds", () => {
  it("declares the range the resolver enforces, so validation fails before RangeError", () => {
    const schema = FiscalYearQuery.properties.fiscalYear;

    expect(JSON.stringify(schema)).toContain(String(FISCAL_YEAR_MIN));
    expect(JSON.stringify(schema)).toContain(String(FISCAL_YEAR_MAX));
  });
});
