import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { Pool } from "pg";
import { accounts, districts, enrolls, factories, provinces } from "../drizzle/schema";
import { createEnrollService } from "./enroll";
import { createFactoryService } from "./factory";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const factoryService = createFactoryService(db);
const enrollService = createEnrollService(db);

// These tests mutate rows, so they may only run against an explicitly disposable, migrated, seeded
// database. When one is not reachable they are SKIPPED with a stated reason rather than failing —
// an ECONNREFUSED stack is indistinguishable from a genuine regression in CI output.
const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[evaluator-detail-region-scope.integration] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run to execute these tests.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

// ─── Fixture constants ───────────────────────────────────────────────────────

const FACTORY_IN_REGION_A = 99981;
const FACTORY_IN_REGION_B = 99982;
const NON_EXISTENT_FACTORY_ID = 999999998;
const NON_EXISTENT_ENROLL_ID = 999999997;
const PROVINCE_A = 10; // seeded province, matches convention used by other integration tests
const SEEDED_EVALUATOR_ID = 78; // seeded ODPC evaluator (FK target for enroll eval_* ids)

let regionA: number;
let provinceB: number;
let enrollInRegionA: number;
let enrollInRegionB: number;

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

const enrollValues = (factoryId: number) => ({
  factoryId,
  evalDohId: SEEDED_EVALUATOR_ID,
  evalOdpcId: SEEDED_EVALUATOR_ID,
  evalMentalId: SEEDED_EVALUATOR_ID,
  employeeThM: 1,
  employeeMmM: 0,
  employeeKhM: 0,
  employeeLaM: 0,
  employeeVnM: 0,
  employeeCnM: 0,
  employeePhM: 0,
  employeeJpM: 0,
  employeeInM: 0,
  employeeOtherM: 0,
  employeeThF: 1,
  employeeMmF: 0,
  employeeKhF: 0,
  employeeLaF: 0,
  employeeVnF: 0,
  employeeCnF: 0,
  employeePhF: 0,
  employeeJpF: 0,
  employeeInF: 0,
  employeeOtherF: 0,
  standardHc: false,
  standardSan: false,
  standardSanPlus: false,
  standardWellness: false,
  standardSafety: false,
  standardTis18001: false,
  standardIso45001: false,
  standardIso14001: false,
  standardZero: false,
  standard5S: false,
  standardHas: false,
  safetyOfficerPrefix: "นาย",
  safetyOfficerFirstName: "ทดสอบ",
  safetyOfficerLastName: "ทดสอบ",
  safetyOfficerPosition: "เจ้าหน้าที่",
});

async function cleanupFactory(factoryId: number) {
  await db.delete(enrolls).where(eq(enrolls.factoryId, factoryId));
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
}

async function seedFactory(accountId: number, provinceId: number) {
  const ref = refByProvince.get(provinceId)!;
  await db.insert(accounts).values({
    id: accountId,
    username: `test_evaluator_region_detail_${accountId}`,
    password: "hashed",
    email: `test_evaluator_region_detail_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ evaluator region detail",
    nameEn: "Test Evaluator Region Detail Factory",
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

  regionA = await db
    .select({ r: provinces.healthRegion })
    .from(provinces)
    .where(eq(provinces.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0]!.r);

  const other = await db
    .select({ p: provinces.provinceId })
    .from(provinces)
    .where(ne(provinces.healthRegion, regionA))
    .limit(1)
    .then((r) => r[0]!);
  provinceB = other.p;

  refByProvince.set(PROVINCE_A, await resolveRef(PROVINCE_A));
  refByProvince.set(provinceB, await resolveRef(provinceB));

  await cleanupFactory(FACTORY_IN_REGION_A);
  await cleanupFactory(FACTORY_IN_REGION_B);

  await seedFactory(FACTORY_IN_REGION_A, PROVINCE_A);
  await seedFactory(FACTORY_IN_REGION_B, provinceB);

  enrollInRegionA = (
    await db.insert(enrolls).values(enrollValues(FACTORY_IN_REGION_A)).returning()
  )[0].id;
  enrollInRegionB = (
    await db.insert(enrolls).values(enrollValues(FACTORY_IN_REGION_B)).returning()
  )[0].id;
});

afterAll(async () => {
  if (dbReachable) {
    await cleanupFactory(FACTORY_IN_REGION_A);
    await cleanupFactory(FACTORY_IN_REGION_B);
  }
  await pool.end().catch(() => {});
});

// ─── Issue 01: evaluator enrollment and factory detail region scope ──────────

describeDb("Issue 01 — evaluator detail reads region scope", () => {
  describe("getFactoryById", () => {
    it("AC: a factory in the evaluator's region is read with the full profile", async () => {
      const factory = await factoryService.getFactoryById(FACTORY_IN_REGION_A, undefined, regionA);
      expect(factory).toMatchObject({
        account_id: FACTORY_IN_REGION_A,
        province_id: PROVINCE_A,
      });
    });

    it("AC: a factory in another region returns 404 factory not found", async () => {
      const result = await factoryService.getFactoryById(FACTORY_IN_REGION_B, undefined, regionA);
      expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
      expect((result as ElysiaCustomStatusResponse).code).toBe(404);
      expect((result as ElysiaCustomStatusResponse).response).toMatchObject({
        message: "factory not found",
      });
    });

    it("AC: a non-existent id returns the identical 404 as the cross-region case", async () => {
      const result = await factoryService.getFactoryById(
        NON_EXISTENT_FACTORY_ID,
        undefined,
        regionA,
      );
      expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
      expect((result as ElysiaCustomStatusResponse).code).toBe(404);
      expect((result as ElysiaCustomStatusResponse).response).toMatchObject({
        message: "factory not found",
      });
    });
  });

  describe("getEnrollById", () => {
    it("AC: an enrollment in the evaluator's region is read with the full record", async () => {
      const result = await enrollService.getEnrollById(enrollInRegionA, undefined, regionA);
      expect(result).not.toBeInstanceOf(ElysiaCustomStatusResponse);
      expect((result as { id: number }).id).toBe(enrollInRegionA);
    });

    it("AC: an enrollment in another region returns 404 enroll not found", async () => {
      const result = await enrollService.getEnrollById(enrollInRegionB, undefined, regionA);
      expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
      expect((result as ElysiaCustomStatusResponse).code).toBe(404);
      expect((result as ElysiaCustomStatusResponse).response).toMatchObject({
        message: "enroll not found",
      });
    });

    it("AC: a non-existent id returns the identical 404 as the cross-region case", async () => {
      const result = await enrollService.getEnrollById(NON_EXISTENT_ENROLL_ID, undefined, regionA);
      expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
      expect((result as ElysiaCustomStatusResponse).code).toBe(404);
      expect((result as ElysiaCustomStatusResponse).response).toMatchObject({
        message: "enroll not found",
      });
    });
  });
});
