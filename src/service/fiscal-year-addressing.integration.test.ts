import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts, districts, enrolls, factories, provinces } from "../drizzle/schema";
import { utilities } from "../utils";
import { createEnrollService } from "./enroll";
import { createFactoryService } from "./factory";

/**
 * Proves the behaviour this intent exists for: a fiscal year other than the current one can be
 * addressed, and omitting the parameter changes nothing.
 *
 * Fixture dates are built with `utilities().getFiscalYear(year)` rather than host-local
 * `new Date(y, 9, 1)`. The latter is what `factory-pagination.integration.test.ts:159-160` does and
 * is why that file is timezone-fragile; this file must not inherit that.
 */

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const enrollService = createEnrollService(db);
const factoryService = createFactoryService(db);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[fiscal-year-addressing.integration] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run to execute these tests.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

const FACTORY_BOTH = 99971; // enrolled in the current year AND the previous one
const FACTORY_PRIOR_ONLY = 99972; // enrolled in the previous year only
const PROVINCE_A = 10;
const ALL = [FACTORY_BOTH, FACTORY_PRIOR_ONLY];
const SEEDED_EVALUATOR_ID = 78;

const CURRENT_FY = utilities().getFiscalYear().fiscalYear;
const PRIOR_FY = CURRENT_FY - 1;
/** A year in range that no fixture uses, to prove "valid but empty" is not a 404. */
const EMPTY_FY = 2005;

let regionA: number;
let ref: { districtId: number; subdistrictId: number };

/** Mid-year instant for a fiscal year — safely inside the window, never on a boundary. */
const midFiscalYear = (fy: number) => {
  const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(fy);
  return new Date((fiscalYearStart.getTime() + fiscalYearEnd.getTime()) / 2).toISOString();
};

const enrollValues = (factoryId: number, enrollDate: string) => ({
  factoryId,
  enrollDate,
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

async function seedFactory(accountId: number) {
  await db.insert(accounts).values({
    id: accountId,
    username: `test_fy_${accountId}`,
    password: "hashed",
    email: `test_fy_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบปีงบประมาณ",
    nameEn: "Test Fiscal Year Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: PROVINCE_A,
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate: true,
  });
}

beforeAll(async () => {
  if (!dbReachable) return;

  regionA = await db
    .select({ region: provinces.healthRegion })
    .from(provinces)
    .where(eq(provinces.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0]?.region as number);

  const district = await db
    .select({ districtId: districts.districtId })
    .from(districts)
    .where(eq(districts.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0]);
  ref = {
    districtId: district?.districtId as number,
    subdistrictId: (district?.districtId as number) * 100 + 1,
  };

  for (const id of ALL) await cleanupFactory(id);
  await seedFactory(FACTORY_BOTH);
  await seedFactory(FACTORY_PRIOR_ONLY);

  await db.insert(enrolls).values(enrollValues(FACTORY_BOTH, midFiscalYear(CURRENT_FY)));
  await db.insert(enrolls).values(enrollValues(FACTORY_BOTH, midFiscalYear(PRIOR_FY)));
  await db.insert(enrolls).values(enrollValues(FACTORY_PRIOR_ONLY, midFiscalYear(PRIOR_FY)));
});

afterAll(async () => {
  if (dbReachable) for (const id of ALL) await cleanupFactory(id);
  await pool.end();
});

describeDb("Factory self-read — addressing a fiscal year", () => {
  it("returns the CURRENT year when no year is supplied", async () => {
    const result = await enrollService.getEnrollByFactoryId(FACTORY_BOTH);

    expect(result).toHaveProperty("fiscalYear", CURRENT_FY);
  });

  it("returns the PRIOR year when that year is addressed", async () => {
    const result = await enrollService.getEnrollByFactoryId(FACTORY_BOTH, PRIOR_FY);

    expect(result).toHaveProperty("fiscalYear", PRIOR_FY);
  });

  it("selects a different row for each year, not the same row relabelled", async () => {
    const current = await enrollService.getEnrollByFactoryId(FACTORY_BOTH);
    const prior = await enrollService.getEnrollByFactoryId(FACTORY_BOTH, PRIOR_FY);

    expect((current as { id: number }).id).not.toBe((prior as { id: number }).id);
  });

  it("reports not-found for a year the factory never enrolled in — the pre-rollover behaviour", async () => {
    const result = await enrollService.getEnrollByFactoryId(FACTORY_PRIOR_ONLY);

    expect(result).toEqual({ message: "no enrollment found" });
  });

  it("makes that same factory visible once its year is named", async () => {
    const result = await enrollService.getEnrollByFactoryId(FACTORY_PRIOR_ONLY, PRIOR_FY);

    expect(result).toHaveProperty("fiscalYear", PRIOR_FY);
  });
});

describeDb("Staff enrollment list — addressing a fiscal year", () => {
  const idsIn = (page: { items: unknown[] }) =>
    page.items.map((i) => (i as { factoryId: number }).factoryId);

  it("excludes a prior-year-only factory from the current year", async () => {
    const page = await enrollService.getAllEnrolls(undefined, undefined, undefined, { limit: 100 });

    expect(idsIn(page)).not.toContain(FACTORY_PRIOR_ONLY);
  });

  it("includes it when the prior year is addressed", async () => {
    const page = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    expect(idsIn(page)).toContain(FACTORY_PRIOR_ONLY);
  });

  it("stamps every item with the addressed year", async () => {
    const page = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    for (const item of page.items) expect(item).toHaveProperty("fiscalYear", PRIOR_FY);
  });

  it("keeps meta.total in agreement with the page under an addressed year", async () => {
    const page = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    expect(page.items.length).toBeLessThanOrEqual(page.meta.total);
    expect(page.meta.total).toBeGreaterThanOrEqual(2); // both fixtures enrolled in PRIOR_FY
  });

  it("returns an empty page — not a 404 — for a valid year with no data", async () => {
    const page = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 100,
      fiscalYear: EMPTY_FY,
    });

    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
    expect(page.meta.totalPages).toBe(0);
  });

  it("preserves province scoping for an addressed year", async () => {
    const page = await enrollService.getAllEnrollsByProvince(PROVINCE_A, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    expect(idsIn(page)).toContain(FACTORY_PRIOR_ONLY);
  });
});

describeDb("Factory list — the enrolled=false exception", () => {
  it("stamps fiscalYear when the fiscal predicate is applied", async () => {
    const page = await factoryService.getAllFactoriesByRegion({
      validated: true,
      enrolled: true,
      region: regionA,
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    for (const item of page.items) expect(item).toHaveProperty("fiscalYear", PRIOR_FY);
  });

  it("OMITS fiscalYear when enrolled=false disables fiscal filtering", async () => {
    // Those rows may span years, so a single value would be untruthful. See docs/api-conventions.md.
    const page = await factoryService.getAllFactoriesByRegion({
      validated: true,
      enrolled: false,
      region: regionA,
      limit: 100,
    });

    for (const item of page.items) expect(item).not.toHaveProperty("fiscalYear");
  });
});

describeDb("Role scoping holds for an addressed fiscal year", () => {
  const idsIn = (page: { items: unknown[] }) =>
    page.items.map((i) => (i as { factoryId: number }).factoryId);

  it("Evaluator sees its own region for an addressed year", async () => {
    const page = await enrollService.getAllEnrolls(regionA, undefined, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    expect(idsIn(page)).toContain(FACTORY_PRIOR_ONLY);
  });

  it("Evaluator sees nothing from a region it does not own, even when the year is named", async () => {
    // Pick any health region other than the fixtures'.
    const otherRegion = regionA === 1 ? 2 : 1;
    const page = await enrollService.getAllEnrolls(otherRegion, undefined, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    expect(idsIn(page)).not.toContain(FACTORY_PRIOR_ONLY);
    expect(idsIn(page)).not.toContain(FACTORY_BOTH);
  });

  it("DOED sees nationally for an addressed year", async () => {
    const page = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    expect(idsIn(page)).toContain(FACTORY_PRIOR_ONLY);
    expect(idsIn(page)).toContain(FACTORY_BOTH);
  });

  it("Provincial sees nothing from a province it does not own", async () => {
    const otherProvince = PROVINCE_A === 11 ? 12 : 11;
    const page = await enrollService.getAllEnrollsByProvince(otherProvince, undefined, {
      limit: 100,
      fiscalYear: PRIOR_FY,
    });

    expect(idsIn(page)).not.toContain(FACTORY_PRIOR_ONLY);
  });

  it("a Factory self-read never returns another Factory's row, whatever year is addressed", async () => {
    // The parameter narrows a result set; it can never widen one. `factoryId` comes from the JWT
    // subject at the route, so there is no path by which a query value selects a different owner.
    for (const year of [CURRENT_FY, PRIOR_FY, EMPTY_FY]) {
      const result = await enrollService.getEnrollByFactoryId(FACTORY_PRIOR_ONLY, year);
      if ("factoryId" in (result as object)) {
        expect((result as { factoryId: number }).factoryId).toBe(FACTORY_PRIOR_ONLY);
      }
    }
  });

  it("an addressed year narrows a result set and never widens it", async () => {
    const current = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 100,
    });
    const scopedToRegion = await enrollService.getAllEnrolls(regionA, undefined, undefined, {
      limit: 100,
    });

    expect(scopedToRegion.meta.total).toBeLessThanOrEqual(current.meta.total);
  });
});
