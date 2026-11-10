import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  authenticatedRequest,
  removeAccount,
  seedEvaluatorAccount,
  signAccessToken,
} from "../../../test/authenticated-request";
import {
  geoOf,
  pickRegionLayout,
  type RegionLayout,
  removeFactoryWithCovers,
  seedEnrollWithCover,
  seedFactoryInProvince,
} from "../../../test/staff-list-fixtures";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[evaluators/score authenticated integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const EVALUATOR_ID = 99965;
const IN_REGION_P1 = 99967;
const IN_REGION_P2 = 99968;
const OUT_OF_REGION = 99969;
const FACTORIES = [IN_REGION_P1, IN_REGION_P2, OUT_OF_REGION];

const ROUTE = "src/routes/evaluators/score/index.ts";

let layout: RegionLayout;
let token: string;

const cleanup = async () => {
  for (const id of FACTORIES) await removeFactoryWithCovers(db, id);
  await removeAccount(db, EVALUATOR_ID);
};

beforeAll(async () => {
  if (!dbReachable) return;

  layout = await pickRegionLayout(db);
  await cleanup();
  const evaluator = await seedEvaluatorAccount(db, { id: EVALUATOR_ID, region: layout.region });
  token = await signAccessToken(evaluator);

  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(now.getFullYear() - 1);
  const placements = [
    [IN_REGION_P1, layout.provinceInRegion],
    [IN_REGION_P2, layout.otherProvinceInRegion],
    [OUT_OF_REGION, layout.provinceOutOfRegion],
  ] as const;
  for (const [id, provinceId] of placements) {
    await seedFactoryInProvince(db, id, provinceId, await geoOf(db, provinceId));
    for (const date of [now, yearAgo]) {
      await seedEnrollWithCover(db, id, date.toISOString(), "in_review");
    }
  }
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await pool.end().catch(() => {});
});

type ListBody = { items: Array<{ factoryId: number }>; meta: { total: number } };

const get = async (query: Record<string, string | number | boolean | undefined>, t = token) => {
  const response = await authenticatedRequest(ROUTE, { token: t, query });
  return { status: response.status, body: response.json<ListBody>() };
};

const mine = (body: ListBody) =>
  body.items
    .map((i) => i.factoryId)
    .filter((id) => FACTORIES.includes(id))
    .sort((a, b) => a - b);

describeDb("GET evaluators/score with a real access token", () => {
  it("rejects a request with no token", async () => {
    const response = await authenticatedRequest(ROUTE);
    expect(response.status).toBe(401);
  });

  it("returns the evaluator's whole region when no province is sent", async () => {
    const { status, body } = await get({});
    expect(status).toBe(200);
    expect(mine(body)).toEqual([IN_REGION_P1, IN_REGION_P2]);
  });

  it("returns the province's rows for an in-region provinceId", async () => {
    const { status, body } = await get({ provinceId: layout.provinceInRegion });
    expect(status).toBe(200);
    expect(mine(body)).toEqual([IN_REGION_P1]);
    expect(body.meta.total).toBe(body.items.length);
  });

  it("returns 200 with no rows and total 0 for an out-of-region provinceId", async () => {
    const { status, body } = await get({ provinceId: layout.provinceOutOfRegion });
    expect(status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it("ignores a region sent by the client and still applies the account's region", async () => {
    const { status, body } = await get({ region: layout.outOfRegionRegion });
    expect(status).toBe(200);
    expect(mine(body)).toEqual([IN_REGION_P1, IN_REGION_P2]);
  });

  it("ignores a client region even when the province is in the account's region", async () => {
    const { status, body } = await get({
      provinceId: layout.provinceInRegion,
      region: layout.outOfRegionRegion,
    });
    expect(status).toBe(200);
    expect(mine(body)).toEqual([IN_REGION_P1]);
  });
});
