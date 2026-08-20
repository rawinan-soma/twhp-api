import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Elysia } from "elysia";
import { LIMIT_DEFAULT, LIMIT_MAX, PAGE_DEFAULT, PaginationQuery } from "../schema/pagination";

// ─── Bolt 028 · gap B2 + the structural half of B4 ───────────────────────────
//
// Bolt 025 proved `PaginationQuery` REJECTS out-of-range values. Nothing proved the nine routes
// USE it. Every test in this intent calls a service directly with an already-resolved page, so a
// route that dropped the composition would serve an unbounded first page and no test would notice.
//
// WHY INTROSPECTION AND NOT AN HTTP REQUEST (technical design D2):
// the obvious test is `GET /...?limit=101` expecting 400. It is wrong here. All nine routes sit
// behind adminGuard / evalGuard / officerGuard, and an unauthenticated request is answered by the
// guard BEFORE query validation runs. That test would assert 401 against a route with no
// pagination schema at all, and pass. Reading the registered schema has no such blind spot.
//
// No database is required: route modules construct the Drizzle client but open no connection.

type RouteEntry = {
  method: string;
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: Elysia does not export the type of a registered route's compiled hooks
  hooks?: { query?: any; response?: any };
};

/** The nine staff list endpoints. Each is `GET ""` inside its own route module. */
const LIST_ROUTES = [
  { name: "admins/factories", mod: "../routes/admins/factories/index", declares404: false },
  { name: "admins/enrolls", mod: "../routes/admins/enrolls/index", declares404: false },
  { name: "admins/score", mod: "../routes/admins/score/index", declares404: false },
  { name: "evaluators/factories", mod: "../routes/evaluators/factories/index", declares404: true },
  { name: "evaluators/enrolls", mod: "../routes/evaluators/enrolls/index", declares404: true },
  { name: "evaluators/score", mod: "../routes/evaluators/score/index", declares404: true },
  {
    name: "provincialOfficers/factories",
    mod: "../routes/provincialOfficers/factories/index",
    declares404: true,
  },
  {
    name: "provincialOfficers/enrolls",
    mod: "../routes/provincialOfficers/enrolls/index",
    declares404: true,
  },
  {
    name: "provincialOfficers/score",
    mod: "../routes/provincialOfficers/score/index",
    declares404: true,
  },
] as const;

/**
 * Apply a route module to a bare Elysia instance and return the registered `GET ""` entry.
 *
 * The route is located by method and path, NOT by "the route that has a page parameter" — that
 * would make a missing schema look like a missing route and skip the assertion instead of failing
 * it.
 */
const listRouteOf = async (modPath: string): Promise<RouteEntry> => {
  // biome-ignore lint/suspicious/noExplicitAny: route modules are typed against the concrete App instance, which cannot be constructed here without booting config, Redis and MinIO
  const define = (await import(modPath)).default as (app: any) => any;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  const app = define(new Elysia() as any) as { routes: RouteEntry[] };
  const entry = app.routes.find((r) => r.method === "GET" && r.path === "");
  if (!entry) throw new Error(`no GET "" route registered by ${modPath}`);
  return entry;
};

/** Elysia stores `response` either as a bare schema or as a status-keyed map. */
// biome-ignore lint/suspicious/noExplicitAny: an unexported union of TSchema and Record<number, TSchema>
const responseFor = (response: any, statusCode: number) => {
  if (!response) return undefined;
  const isStatusMap = response.type === undefined && response[statusCode] !== undefined;
  if (isStatusMap) return response[statusCode];
  return statusCode === 200 ? response : undefined;
};

describe("bolt 028 · B2 — all nine staff list routes compose PaginationQuery", () => {
  for (const route of LIST_ROUTES) {
    describe(route.name, () => {
      it("registers page and limit on its query schema", async () => {
        const { hooks } = await listRouteOf(route.mod);
        const props = hooks?.query?.properties ?? {};
        expect(Object.keys(props)).toContain("page");
        expect(Object.keys(props)).toContain("limit");
      });

      it("keeps page and limit optional, so an omitted parameter is not a 400", async () => {
        const { hooks } = await listRouteOf(route.mod);
        const required: string[] = hooks?.query?.required ?? [];
        expect(required).not.toContain("page");
        expect(required).not.toContain("limit");
      });

      it("uses the SHARED schema, not a local copy that could drift", async () => {
        const { hooks } = await listRouteOf(route.mod);
        // Structural identity is the direct proof of composition. A hand-rolled `page` with the
        // same bounds would pass the behavioural checks below but fail here — and would then
        // silently keep its own bounds when the shared contract changes.
        expect(JSON.stringify(hooks?.query?.properties?.page)).toEqual(
          JSON.stringify(PaginationQuery.properties.page),
        );
        expect(JSON.stringify(hooks?.query?.properties?.limit)).toEqual(
          JSON.stringify(PaginationQuery.properties.limit),
        );
      });

      it("carries the contract defaults and the limit ceiling", async () => {
        const { hooks } = await listRouteOf(route.mod);
        expect(hooks?.query?.properties?.page?.default).toBe(PAGE_DEFAULT);
        expect(hooks?.query?.properties?.limit?.default).toBe(LIMIT_DEFAULT);
        expect(hooks?.query?.properties?.limit?.maximum).toBe(LIMIT_MAX);
      });

      // Values are checked as NUMBERS, i.e. post-coercion — which is what the service receives.
      // `t.Numeric` compiles to anyOf[string(format:numeric), number(bounds)], and the STRING
      // branch carries no bounds, so checking the raw schema with "101" would wrongly pass.
      it("rejects page 0, a fractional page, and accepts page 1", async () => {
        const { hooks } = await listRouteOf(route.mod);
        const page = hooks?.query?.properties?.page;
        expect(Value.Check(page, 0)).toBe(false);
        expect(Value.Check(page, 1.5)).toBe(false);
        expect(Value.Check(page, 1)).toBe(true);
      });

      it("rejects limit 0 and limit above the ceiling, and accepts the ceiling itself", async () => {
        const { hooks } = await listRouteOf(route.mod);
        const limit = hooks?.query?.properties?.limit;
        expect(Value.Check(limit, 0)).toBe(false);
        expect(Value.Check(limit, LIMIT_MAX + 1)).toBe(false);
        expect(Value.Check(limit, 1.5)).toBe(false);
        expect(Value.Check(limit, LIMIT_MAX)).toBe(true);
        expect(Value.Check(limit, LIMIT_DEFAULT)).toBe(true);
      });
    });
  }
});

describe("bolt 028 · B4 (structural) — the declared 200 schema is the envelope", () => {
  for (const route of LIST_ROUTES) {
    it(`${route.name} declares { items, meta } with the four meta fields`, async () => {
      const { hooks } = await listRouteOf(route.mod);
      const ok = responseFor(hooks?.response, 200);
      expect(ok).toBeDefined();
      // Exactly these two keys: an accidental extra top-level field is a contract change.
      expect(Object.keys(ok.properties ?? {}).sort()).toEqual(["items", "meta"]);
      expect(ok.properties.items.type).toBe("array");
      expect(Object.keys(ok.properties.meta.properties ?? {}).sort()).toEqual([
        "limit",
        "page",
        "total",
        "totalPages",
      ]);
    });
  }
});

describe("bolt 028 · B1 (declared contract) — 404 bodies stay unwrapped", () => {
  // Carried unverified since bolt 025. The runtime half — that the services actually RETURN a bare
  // body — is asserted in pagination-contract.integration.test.ts. This half asserts the routes
  // still DECLARE it bare, so a blanket "wrap every response" change fails here even if the
  // service is untouched.
  for (const route of LIST_ROUTES.filter((r) => r.declares404)) {
    it(`${route.name} declares a bare 404 with no envelope keys`, async () => {
      const { hooks } = await listRouteOf(route.mod);
      const notFound = hooks?.response?.[404];
      expect(notFound).toBeDefined();
      const keys = Object.keys(notFound.properties ?? {});
      expect(keys).toContain("message");
      expect(keys).not.toContain("items");
      expect(keys).not.toContain("meta");
    });
  }

  it("covers the six routes that resolve a staff account; the three admin routes need no lookup", () => {
    expect(LIST_ROUTES.filter((r) => r.declares404).length).toBe(6);
  });
});
