import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { Pool } from "pg";
import { accounts, districts, factories, provinces } from "../drizzle/schema";
import { createFactoryService } from "./factory";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const factoryService = createFactoryService(db);

// These tests mutate rows, so they may only run against an explicitly disposable, migrated, seeded
// database. When one is not reachable they are SKIPPED with a stated reason rather than failing —
// an ECONNREFUSED stack is indistinguishable from a genuine regression in CI output.
const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[factory-province-detail.integration] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run to execute these tests.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

// ─── Fixture constants ───────────────────────────────────────────────────────

const FACTORY_IN_PROVINCE_A = 99991;
const FACTORY_IN_PROVINCE_B = 99992;
const NON_EXISTENT_FACTORY_ID = 999999999;
const PROVINCE_A = 10; // seeded province, matches convention used by other factory integration tests

let provinceB: number;

type Ref = { districtId: number; subdistrictId: number };
const refByProvince = new Map<number, Ref>();

async function resolveRef(provinceId: number): Promise<Ref> {
  const district = await db
    .select({ districtId: districts.districtId })
    .from(districts)
    .where(eq(districts.provinceId, provinceId))
    .limit(1)
    .then((r) => r[0]);
  return { districtId: district!.districtId, subdistrictId: district!.districtId * 100 + 1 };
}

async function cleanupFactory(factoryId: number) {
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
}

async function seedFactory(accountId: number, provinceId: number) {
  const ref = refByProvince.get(provinceId)!;
  await db.insert(accounts).values({
    id: accountId,
    username: `test_province_detail_${accountId}`,
    password: "hashed",
    email: `test_province_detail_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ province detail",
    nameEn: "Test Province Detail Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId,
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate: true,
  });
}

beforeAll(async () => {
  if (!dbReachable) return;

  const otherProvince = await db
    .select({ provinceId: provinces.provinceId })
    .from(provinces)
    .where(ne(provinces.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0]);
  provinceB = otherProvince!.provinceId;

  refByProvince.set(PROVINCE_A, await resolveRef(PROVINCE_A));
  refByProvince.set(provinceB, await resolveRef(provinceB));

  await cleanupFactory(FACTORY_IN_PROVINCE_A);
  await cleanupFactory(FACTORY_IN_PROVINCE_B);

  await seedFactory(FACTORY_IN_PROVINCE_A, PROVINCE_A);
  await seedFactory(FACTORY_IN_PROVINCE_B, provinceB);
});

afterAll(async () => {
  if (dbReachable) {
    await cleanupFactory(FACTORY_IN_PROVINCE_A);
    await cleanupFactory(FACTORY_IN_PROVINCE_B);
  }
  await pool.end().catch(() => {});
});

// ─── Issue 04: provincial factory detail scope ───────────────────────────────

describeDb("Issue 04 — provincial factory detail scope", () => {
  it("AC1: a factory in the officer's province is read with the full profile", async () => {
    const factory = await factoryService.getFactoryById(FACTORY_IN_PROVINCE_A, PROVINCE_A);
    expect(factory).toMatchObject({
      account_id: FACTORY_IN_PROVINCE_A,
      province_id: PROVINCE_A,
      province_name_th: expect.any(String),
      district_name_th: expect.any(String),
      subdistrict_name_th: expect.any(String),
    });
  });

  it("AC2: a factory in another province returns 404 factory not found", async () => {
    const result = await factoryService.getFactoryById(FACTORY_IN_PROVINCE_B, PROVINCE_A);
    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((result as ElysiaCustomStatusResponse).code).toBe(404);
    expect((result as ElysiaCustomStatusResponse).response).toMatchObject({
      message: "factory not found",
    });
  });

  it("AC3: a non-existent id returns the identical 404 as the cross-province case", async () => {
    const result = await factoryService.getFactoryById(NON_EXISTENT_FACTORY_ID, PROVINCE_A);
    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((result as ElysiaCustomStatusResponse).code).toBe(404);
    expect((result as ElysiaCustomStatusResponse).response).toMatchObject({
      message: "factory not found",
    });
  });

  it("AC4: the unscoped read (Evaluator path) is unaffected by the optional province constraint", async () => {
    const factory = await factoryService.getFactoryById(FACTORY_IN_PROVINCE_B);
    expect(factory).toMatchObject({ account_id: FACTORY_IN_PROVINCE_B });
  });
});
