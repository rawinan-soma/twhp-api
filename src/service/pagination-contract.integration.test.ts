import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { Pool } from "pg";
import { provinces } from "../drizzle/schema";
import { LIMIT_DEFAULT, PAGE_DEFAULT } from "../schema/pagination";
import { createEnrollService } from "./enroll";
import { createEvaluatorService } from "./evaluator";
import { createFactoryService } from "./factory";
import { createProvincialOfficerService } from "./provincialOfficer";
import { createScoreService } from "./score";

// ─── Bolt 028 · gaps B1 (runtime) and B3 ─────────────────────────────────────
//
// B1 — the 404s on the paginated read paths must stay UNWRAPPED. Carried unverified since bolt
//      025, recorded there as "no test written". A change that wrapped every return value in the
//      envelope would turn `404 invalid evaluator` into `{ items, meta }` and every existing test
//      in this intent would still pass, because none of them ever reads a 404 body.
//      The declared half of this contract is asserted in pagination-routes.test.ts.
//
// B3 — envelope parity ACROSS families and roles. Bolt 027 asserted it for the three score
//      variants; the factory and enrollment families were verified per-endpoint but never compared
//      across all three roles in one assertion. This is the test that fails loudly if any single
//      endpoint drifts back to a bare array.
//
// Shape only: no assertion here depends on how many rows the database holds, so seed drift cannot
// make this file flaky.

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[pagination-contract.integration] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

const factoryService = createFactoryService(db);
const enrollService = createEnrollService(db);
const scoreService = createScoreService(db);
const evaluatorService = createEvaluatorService(db);
const provincialOfficerService = createProvincialOfficerService(db);

/** An account id no fixture uses, so the lookups are guaranteed to miss. */
const ABSENT_ACCOUNT_ID = 99_999_999;

const codeOf = (r: unknown) => (r as { code: number }).code;
const bodyOf = (r: unknown) => (r as { response: unknown }).response;

describeDb("bolt 028 · B1 — 404 bodies on the paginated read paths stay unwrapped", () => {
  it("getEvaluatorData returns a bare 404 for an account with no evaluator row", async () => {
    const result = await evaluatorService.helper.getEvaluatorData(ABSENT_ACCOUNT_ID);

    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(codeOf(result)).toBe(404);

    const body = bodyOf(result) as Record<string, unknown>;
    expect(body).toEqual({ message: "invalid evaluator" });
    // Stated separately from the toEqual above so a failure names the actual defect.
    expect(body).not.toHaveProperty("items");
    expect(body).not.toHaveProperty("meta");
  });

  it("getOfficerDataById returns a bare 404 for an account with no officer row", async () => {
    const result = await provincialOfficerService.getOfficerDataById(ABSENT_ACCOUNT_ID);

    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(codeOf(result)).toBe(404);

    const body = bodyOf(result) as Record<string, unknown>;
    expect(body).toEqual({ message: "officer not found" });
    expect(body).not.toHaveProperty("items");
    expect(body).not.toHaveProperty("meta");
  });

  it("a 404 is not an empty page — the two must stay distinguishable", async () => {
    // The failure this guards against is subtle: wrapping a 404 produces `{items: [], meta: {...}}`
    // with status 200-shaped content, which a client cannot tell from "this staff member has no
    // factories". The response must remain a status response, not a page.
    const notFound = await evaluatorService.helper.getEvaluatorData(ABSENT_ACCOUNT_ID);
    expect(notFound).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(bodyOf(notFound)).not.toHaveProperty("items");
  });
});

// A real province and its health region, read from the database rather than hard-coded, so the
// suite does not depend on a particular seed row surviving. Resolved at module scope because a
// describe() callback is synchronous.
const scope = dbReachable
  ? await db
      .select({ provinceId: provinces.provinceId, region: provinces.healthRegion })
      .from(provinces)
      .limit(1)
      .then((rows) => rows[0])
  : { provinceId: 0, region: 0 };

describeDb("bolt 028 · B3 — every one of the nine endpoints returns the same envelope", () => {
  const page = { page: PAGE_DEFAULT, limit: LIMIT_DEFAULT };

  const CALLS: { name: string; role: string; family: string; run: () => Promise<unknown> }[] = [
    {
      name: "admins/factories",
      role: "Admin",
      family: "Factory",
      run: () => factoryService.getAllFactories({ validated: true, ...page }),
    },
    {
      name: "admins/enrolls",
      role: "Admin",
      family: "Enrollment",
      run: () => enrollService.getAllEnrolls(undefined, undefined, undefined, page),
    },
    {
      name: "admins/score",
      role: "Admin",
      family: "Score Report",
      run: () => scoreService.getAllScores({}, page),
    },
    {
      name: "evaluators/factories",
      role: "Evaluator",
      family: "Factory",
      run: () =>
        factoryService.getAllFactoriesByRegion({
          validated: true,
          region: scope.region,
          ...page,
        }),
    },
    {
      name: "evaluators/enrolls",
      role: "Evaluator",
      family: "Enrollment",
      run: () => enrollService.getAllEnrolls(scope.region, undefined, undefined, page),
    },
    {
      name: "evaluators/score",
      role: "Evaluator",
      family: "Score Report",
      run: () => scoreService.getScoresByRegion(scope.region, page),
    },
    {
      name: "provincialOfficers/factories",
      role: "Provincial Officer",
      family: "Factory",
      run: () =>
        factoryService.getAllFactoriesByProvinceId({
          validated: true,
          provinceId: scope.provinceId,
          ...page,
        }),
    },
    {
      name: "provincialOfficers/enrolls",
      role: "Provincial Officer",
      family: "Enrollment",
      run: () => enrollService.getAllEnrollsByProvince(scope.provinceId, undefined, page),
    },
    {
      name: "provincialOfficers/score",
      role: "Provincial Officer",
      family: "Score Report",
      run: () => scoreService.getScoresByProvince(scope.provinceId, page),
    },
  ];

  for (const call of CALLS) {
    it(`${call.name} (${call.role} · ${call.family}) returns { items, meta }, never a bare array`, async () => {
      const result = (await call.run()) as { items: unknown[]; meta: Record<string, number> };

      expect(Array.isArray(result)).toBe(false);
      expect(Object.keys(result).sort()).toEqual(["items", "meta"]);
      expect(Array.isArray(result.items)).toBe(true);

      expect(Object.keys(result.meta).sort()).toEqual(["limit", "page", "total", "totalPages"]);
      for (const field of ["page", "limit", "total", "totalPages"]) {
        expect(typeof result.meta[field]).toBe("number");
        expect(Number.isInteger(result.meta[field])).toBe(true);
      }

      expect(result.meta.page).toBe(PAGE_DEFAULT);
      expect(result.meta.limit).toBe(LIMIT_DEFAULT);
      expect(result.meta.total).toBeGreaterThanOrEqual(0);
      expect(result.items.length).toBeLessThanOrEqual(LIMIT_DEFAULT);
    });
  }

  for (const call of CALLS) {
    it(`${call.name} keeps totalPages = ceil(total / limit)`, async () => {
      const result = (await call.run()) as { meta: { total: number; totalPages: number } };
      const expected = result.meta.total === 0 ? 0 : Math.ceil(result.meta.total / LIMIT_DEFAULT);
      expect(result.meta.totalPages).toBe(expected);
    });
  }

  it("covers all three roles and all three resource families", () => {
    expect(new Set(CALLS.map((c) => c.role)).size).toBe(3);
    expect(new Set(CALLS.map((c) => c.family)).size).toBe(3);
    expect(CALLS.length).toBe(9);
  });
});
