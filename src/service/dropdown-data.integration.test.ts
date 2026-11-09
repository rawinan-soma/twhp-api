import { afterAll, describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { Pool } from "pg";
import { provinces } from "../drizzle/schema";
import { createAuthenticationUsecase } from "./authentication";
import { createLocationService } from "./location";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[dropdown-data.integration] SKIPPED — no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const SEEDED_EVALUATOR_ACCOUNT_ID = 79;
const SEEDED_EVALUATOR_REGION = 2;
const SEEDED_ADMIN_ACCOUNT_ID = 117;
const SEEDED_PROVINCIAL_ACCOUNT_ID = 1;
const BANGKOK_PROVINCE_ID = 10;
const BANGKOK_HEALTH_REGION = 13;
const CHIANG_MAI_PROVINCE_ID = 50;
const CHIANG_MAI_HEALTH_REGION = 1;

const locationService = createLocationService(db);
const { helper } = createAuthenticationUsecase(db);

afterAll(async () => {
  await pool.end();
});

describeDb("province list exposes health_region", () => {
  it("returns health_region on every province row alongside the existing fields", async () => {
    const rows = await locationService.getAllProvinces();
    const stored = await db.select().from(provinces);

    expect(rows.length).toBe(stored.length);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const source = stored.find((p) => p.provinceId === row.province_id);
      expect(row.name_th).toBe(source!.nameTh);
      expect(typeof row.health_region).toBe("number");
      expect(row.health_region).toBe(source!.healthRegion);
    }
  });

  it("reports the seeded region for known provinces", async () => {
    const rows = await locationService.getAllProvinces();
    const byId = new Map(rows.map((r) => [r.province_id, r.health_region]));

    expect(byId.get(BANGKOK_PROVINCE_ID)).toBe(BANGKOK_HEALTH_REGION);
    expect(byId.get(CHIANG_MAI_PROVINCE_ID)).toBe(CHIANG_MAI_HEALTH_REGION);
  });
});

describeDb("current-session account exposes region", () => {
  it("returns the Evaluator's own region and keeps existing fields", async () => {
    const result = await helper.getAccountById(SEEDED_EVALUATOR_ACCOUNT_ID);

    expect(result instanceof ElysiaCustomStatusResponse).toBe(false);
    if (result instanceof ElysiaCustomStatusResponse) return;
    expect(result.region).toBe(SEEDED_EVALUATOR_REGION);
    expect(result.id).toBe(SEEDED_EVALUATOR_ACCOUNT_ID);
    expect(result.role).toBe("Evaluator");
    expect(result.eval_level).toBe("ODPC");
    expect(typeof result.username).toBe("string");
    expect(typeof result.change_pw).toBe("boolean");
    expect(typeof result.full_name).toBe("string");
  });

  it("returns null region for an Admin", async () => {
    const result = await helper.getAccountById(SEEDED_ADMIN_ACCOUNT_ID);

    expect(result instanceof ElysiaCustomStatusResponse).toBe(false);
    if (result instanceof ElysiaCustomStatusResponse) return;
    expect(result.role).toBe("DOED");
    expect(result.region).toBeNull();
    expect(result.eval_level).toBeNull();
  });

  it("returns null region for a Provincial Officer", async () => {
    const result = await helper.getAccountById(SEEDED_PROVINCIAL_ACCOUNT_ID);

    expect(result instanceof ElysiaCustomStatusResponse).toBe(false);
    if (result instanceof ElysiaCustomStatusResponse) return;
    expect(result.role).toBe("Provincial");
    expect(result.region).toBeNull();
  });
});
