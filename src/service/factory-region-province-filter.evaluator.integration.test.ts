import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  districts,
  enrolls,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import { utilities } from "../utils";
import { createFactoryService } from "./factory";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const factoryService = createFactoryService(db);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[factory-region-province-filter.evaluator.integration] SKIPPED, no reachable DATABASE_URL.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

const IN_P1_CURRENT = 99941;
const IN_P1_LAST_YEAR_ONLY = 99942;
const IN_P2_CURRENT = 99943;
const IN_P1_UNVALIDATED = 99944;
const IN_P1_CURRENT_B = 99945;
const OUT_OF_REGION = 99946;
const ALL = [
  IN_P1_CURRENT,
  IN_P1_LAST_YEAR_ONLY,
  IN_P2_CURRENT,
  IN_P1_UNVALIDATED,
  IN_P1_CURRENT_B,
  OUT_OF_REGION,
];

const SEEDED_EVALUATOR_ID = 78;
const UNKNOWN_PROVINCE = 999999;

let region: number;
let provinceInRegion: number;
let otherProvinceInRegion: number;
let provinceOutOfRegion: number;
let fiscalYear: number;
let lastFiscalYear: number;
const geo: Record<number, { districtId: number; subdistrictId: number }> = {};

const geoOf = async (provinceId: number) => {
  const row = await db
    .select({ districtId: districts.districtId, subdistrictId: subdistricts.subdistrictId })
    .from(districts)
    .innerJoin(subdistricts, eq(subdistricts.districtId, districts.districtId))
    .where(eq(districts.provinceId, provinceId))
    .orderBy(asc(subdistricts.subdistrictId))
    .limit(1)
    .then((r) => r[0]);
  if (!row) throw new Error(`no district and subdistrict seeded for province ${provinceId}`);
  return row;
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

const cleanupFactory = async (factoryId: number) => {
  await db.delete(enrolls).where(eq(enrolls.factoryId, factoryId));
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
};

const seedFactory = async (accountId: number, provinceId: number, isValidate = true) => {
  await db.insert(accounts).values({
    id: accountId,
    username: `test_region_province_${accountId}`,
    password: "hashed",
    email: `test_region_province_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ region province",
    nameEn: "Test Region Province Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId,
    districtId: geo[provinceId].districtId,
    subdistrictId: geo[provinceId].subdistrictId,
    isValidate,
  });
};

beforeAll(async () => {
  if (!dbReachable) return;

  fiscalYear = utilities().getFiscalYear().fiscalYear;
  lastFiscalYear = fiscalYear - 1;

  const provinceRows = await db
    .select({ provinceId: provinces.provinceId, healthRegion: provinces.healthRegion })
    .from(provinces)
    .orderBy(asc(provinces.provinceId));

  const first = provinceRows.find(
    (p) => provinceRows.filter((q) => q.healthRegion === p.healthRegion).length >= 2,
  );
  if (!first) throw new Error("seed data has no health region with two provinces");
  region = first.healthRegion;
  provinceInRegion = first.provinceId;
  const sibling = provinceRows.find(
    (p) => p.healthRegion === region && p.provinceId !== provinceInRegion,
  );
  const outsider = provinceRows.find((p) => p.healthRegion !== region);
  if (!sibling || !outsider) throw new Error("seed data lacks a second province or region");
  otherProvinceInRegion = sibling.provinceId;
  provinceOutOfRegion = outsider.provinceId;

  for (const id of [provinceInRegion, otherProvinceInRegion, provinceOutOfRegion]) {
    geo[id] = await geoOf(id);
  }

  for (const id of ALL) await cleanupFactory(id);

  await seedFactory(IN_P1_CURRENT, provinceInRegion);
  await seedFactory(IN_P1_LAST_YEAR_ONLY, provinceInRegion);
  await seedFactory(IN_P2_CURRENT, otherProvinceInRegion);
  await seedFactory(IN_P1_UNVALIDATED, provinceInRegion, false);
  await seedFactory(IN_P1_CURRENT_B, provinceInRegion);
  await seedFactory(OUT_OF_REGION, provinceOutOfRegion);

  const thisYear = utilities().getFiscalYear(fiscalYear).fiscalYearStart.toISOString();
  const lastYear = utilities().getFiscalYear(lastFiscalYear).fiscalYearStart.toISOString();

  for (const id of [
    IN_P1_CURRENT,
    IN_P2_CURRENT,
    IN_P1_UNVALIDATED,
    IN_P1_CURRENT_B,
    OUT_OF_REGION,
  ]) {
    await db.insert(enrolls).values(enrollValues(id, thisYear));
  }
  await db.insert(enrolls).values(enrollValues(IN_P1_LAST_YEAR_ONLY, lastYear));
});

afterAll(async () => {
  if (dbReachable) {
    for (const id of ALL) await cleanupFactory(id);
  }
  await pool.end().catch(() => {});
});

const mine = (page: { items: Array<{ account_id: number }> }) =>
  page.items.map((i) => i.account_id).filter((id) => ALL.includes(id));

const list = (params: {
  validated?: boolean;
  enrolled?: boolean;
  provinceId?: number;
  fiscalYear?: number;
  page?: number;
  limit?: number;
}) =>
  factoryService.getAllFactoriesByRegion({
    validated: true,
    fiscalYear,
    limit: 100,
    region,
    ...params,
  });

describeDb("evaluator factory list narrowed by province inside the region", () => {
  it("returns only the province's factories, excluding its siblings and other regions", async () => {
    const page = await list({ provinceId: provinceInRegion });
    expect(mine(page)).toEqual([IN_P1_CURRENT, IN_P1_CURRENT_B]);
  });

  it("returns the other in-region province's own factories for that province", async () => {
    const page = await list({ provinceId: otherProvinceInRegion });
    expect(mine(page)).toEqual([IN_P2_CURRENT]);
  });

  it("returns the whole region when no province is given", async () => {
    const page = await list({});
    expect(mine(page)).toEqual([IN_P1_CURRENT, IN_P2_CURRENT, IN_P1_CURRENT_B]);
    expect(mine(page)).not.toContain(OUT_OF_REGION);
  });

  it("returns an empty page with total 0 for a province outside the region", async () => {
    const page = await list({ provinceId: provinceOutOfRegion });
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("returns an empty page with total 0 for an unknown province", async () => {
    const page = await list({ provinceId: UNKNOWN_PROVINCE });
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("never lists the out-of-region factory, whichever province is asked for", async () => {
    for (const provinceId of [undefined, provinceInRegion, otherProvinceInRegion]) {
      const page = await list({ provinceId });
      expect(mine(page)).not.toContain(OUT_OF_REGION);
    }
  });

  it("reports a total that matches the filtered rows", async () => {
    const filtered = await list({ provinceId: provinceInRegion });
    expect(filtered.meta.total).toBe(filtered.items.length);

    const wholeRegion = await list({});
    expect(wholeRegion.meta.total).toBe(wholeRegion.items.length);
    expect(filtered.meta.total).toBeLessThan(wholeRegion.meta.total);
  });
});

describeDb("province filter combined with the existing list filters", () => {
  it("combines with validated=false", async () => {
    const page = await list({ provinceId: provinceInRegion, validated: false });
    expect(mine(page)).toEqual([IN_P1_UNVALIDATED]);
    expect(page.meta.total).toBe(page.items.length);
  });

  it("combines with validated=false and an out-of-region province", async () => {
    const page = await list({ provinceId: provinceOutOfRegion, validated: false });
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("combines with enrolled=true for the fiscal year", async () => {
    const page = await list({ provinceId: provinceInRegion, enrolled: true });
    expect(mine(page)).not.toContain(IN_P1_LAST_YEAR_ONLY);
    expect(mine(page)).toEqual([IN_P1_CURRENT, IN_P1_CURRENT_B]);
  });

  it("combines with enrolled=false, which lifts the fiscal year restriction", async () => {
    const page = await list({ provinceId: provinceInRegion, enrolled: false });
    expect(mine(page)).toEqual([IN_P1_CURRENT, IN_P1_LAST_YEAR_ONLY, IN_P1_CURRENT_B]);
    expect(page.meta.total).toBe(page.items.length);
  });

  it("combines with fiscalYear, selecting the factory enrolled only in that year", async () => {
    const page = await list({ provinceId: provinceInRegion, fiscalYear: lastFiscalYear });
    expect(mine(page)).toEqual([IN_P1_LAST_YEAR_ONLY]);
    expect(page.meta.total).toBe(page.items.length);
  });

  it("combines with pagination, keeping total at the filtered count", async () => {
    const first = await list({ provinceId: provinceInRegion, limit: 1, page: 1 });
    const second = await list({ provinceId: provinceInRegion, limit: 1, page: 2 });
    const third = await list({ provinceId: provinceInRegion, limit: 1, page: 3 });

    expect(first.meta.total).toBe(second.meta.total);
    expect(first.meta.total).toBe(first.meta.totalPages);
    expect(mine(first)).toEqual([IN_P1_CURRENT]);
    expect(mine(second)).toEqual([IN_P1_CURRENT_B]);
    expect(third.items).toEqual([]);
    expect(third.meta.total).toBe(first.meta.total);
  });
});
