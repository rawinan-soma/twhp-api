import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  coverLogs,
  covers,
  districts,
  enrolls,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import { utilities } from "../utils";
import { createEnrollService } from "./enroll";
import { createFactoryService } from "./factory";

const pool = new Pool({
  connectionString: Bun.env.DATABASE_URL as string,
  connectionTimeoutMillis: 3000,
});
const db = drizzle(pool);
const factoryService = createFactoryService(db);
const enrollService = createEnrollService(db);

const SEEDED_EVALUATOR_ID = 78;
const UNKNOWN_REGION = 9999;
const UNKNOWN_PROVINCE = 99999;

const F_A_MULTI = 99961;
const F_A2 = 99962;
const F_B = 99963;
const F_A_UNVALIDATED = 99964;
const F_A_NO_ENROLL = 99965;
const FACTORY_IDS = [F_A_MULTI, F_A2, F_B, F_A_UNVALIDATED, F_A_NO_ENROLL];

let provinceA: number;
let provinceA2: number;
let provinceB: number;
let regionA: number;
let regionB: number;
let currentYear: number;
let previousYear: number;

let enrollAFinished: number;
let enrollAPreviousYear: number;
let enrollA2NoCover: number;
let enrollBFinished: number;
let enrollIds: number[];

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

async function cleanup() {
  const rows = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(inArray(enrolls.factoryId, FACTORY_IDS));
  const enrollRowIds = rows.map((r) => r.id);
  if (enrollRowIds.length > 0) {
    const coverRows = await db
      .select({ id: covers.id })
      .from(covers)
      .where(inArray(covers.enrollId, enrollRowIds));
    const coverRowIds = coverRows.map((c) => c.id);
    if (coverRowIds.length > 0) {
      await db.delete(coverLogs).where(inArray(coverLogs.coverId, coverRowIds));
      await db.delete(covers).where(inArray(covers.id, coverRowIds));
    }
    await db.delete(enrolls).where(inArray(enrolls.id, enrollRowIds));
  }
  await db.delete(factories).where(inArray(factories.accountId, FACTORY_IDS));
  await db.delete(accounts).where(inArray(accounts.id, FACTORY_IDS));
}

async function seedFactory(
  accountId: number,
  provinceId: number,
  ref: { districtId: number; subdistrictId: number },
  isValidate = true,
) {
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
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate,
  });
}

async function seedEnroll(
  factoryId: number,
  enrollDate: string,
  coverStatus?: "finished" | "in_progress",
) {
  const [enroll] = await db.insert(enrolls).values(enrollValues(factoryId, enrollDate)).returning();
  if (coverStatus) {
    const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
    await db.insert(coverLogs).values({ coverId: cover.id, status: coverStatus });
  }
  return enroll.id;
}

beforeAll(async () => {
  await cleanup();

  const allProvinces = await db
    .select({ p: provinces.provinceId, r: provinces.healthRegion })
    .from(provinces)
    .orderBy(provinces.provinceId);
  const byRegion = new Map<number, number[]>();
  for (const { p, r } of allProvinces) byRegion.set(r, [...(byRegion.get(r) ?? []), p]);
  const [sharedRegion, sharedProvinces] =
    [...byRegion.entries()].find(([, ps]) => ps.length >= 2) ?? [];
  if (sharedRegion === undefined || sharedProvinces === undefined) {
    throw new Error("seed data has no health region with two provinces");
  }
  regionA = sharedRegion;
  provinceA = sharedProvinces[0];
  provinceA2 = sharedProvinces[1];
  const other = await db
    .select({ p: provinces.provinceId, r: provinces.healthRegion })
    .from(provinces)
    .where(ne(provinces.healthRegion, regionA))
    .limit(1)
    .then((r) => r[0]);
  provinceB = other.p;
  regionB = other.r;

  const ref = await db
    .select({ districtId: districts.districtId, subdistrictId: subdistricts.subdistrictId })
    .from(districts)
    .innerJoin(subdistricts, eq(subdistricts.districtId, districts.districtId))
    .limit(1)
    .then((r) => r[0]);

  await seedFactory(F_A_MULTI, provinceA, ref);
  await seedFactory(F_A2, provinceA2, ref);
  await seedFactory(F_B, provinceB, ref);
  await seedFactory(F_A_UNVALIDATED, provinceA, ref, false);
  await seedFactory(F_A_NO_ENROLL, provinceA, ref);

  const current = utilities().getReviewerFiscalYear();
  currentYear = current.fiscalYear;
  previousYear = currentYear - 1;
  const currentDate = current.fiscalYearStart.toISOString();
  const previousDate = utilities()
    .getReviewerFiscalYear(previousYear)
    .fiscalYearStart.toISOString();

  enrollAFinished = await seedEnroll(F_A_MULTI, currentDate, "finished");
  enrollAPreviousYear = await seedEnroll(F_A_MULTI, previousDate);
  enrollA2NoCover = await seedEnroll(F_A2, currentDate);
  enrollBFinished = await seedEnroll(F_B, currentDate, "finished");
  enrollIds = [enrollAFinished, enrollAPreviousYear, enrollA2NoCover, enrollBFinished];
});

afterAll(async () => {
  await cleanup();
  await pool.end().catch(() => {});
});

type Page<T> = { items: T[]; meta: { total: number; totalPages: number } };

async function drain<T>(fetch: (pg: { page: number; limit: number }) => Promise<Page<T>>) {
  const items: T[] = [];
  let total = 0;
  for (let page = 1; ; page += 1) {
    const result = await fetch({ page, limit: 100 });
    items.push(...result.items);
    total = result.meta.total;
    if (page >= result.meta.totalPages) break;
  }
  return { items, total };
}

type FactoryParams = {
  validated?: boolean;
  enrolled?: boolean;
  region?: number;
  provinceId?: number;
  fiscalYear?: number;
};

const factoryIds = async (params: FactoryParams = {}) => {
  const { items, total } = await drain((pg) =>
    factoryService.getAllFactories({ validated: true, ...params, ...pg }),
  );
  const all = (items as unknown as Array<{ account_id: number }>).map((i) => i.account_id);
  return { ids: all.filter((id) => FACTORY_IDS.includes(id)), all, total };
};

type EnrollParams = {
  region?: number;
  provinceId?: number;
  coverStatus?: "finished" | "in_progress" | "in_review" | "none";
  fiscalYear?: number;
};

const enrollIdsOf = async ({ region, provinceId, coverStatus, fiscalYear }: EnrollParams = {}) => {
  const { items, total } = await drain((pg) =>
    enrollService.getAllEnrolls(region, provinceId, coverStatus, { ...pg, fiscalYear }),
  );
  const all = (items as unknown as Array<{ id: number }>).map((i) => i.id);
  return { ids: all.filter((id) => enrollIds.includes(id)), all, total };
};

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

describe("admin factory list — region and province filters", () => {
  it("region alone returns only factories in that health region", async () => {
    const { ids, all, total } = await factoryIds({ region: regionA });
    expect(sorted(ids)).toEqual(sorted([F_A_MULTI, F_A2, F_A_NO_ENROLL]));
    expect(total).toBe(all.length);
  });

  it("province alone returns only factories in that province", async () => {
    const { ids } = await factoryIds({ provinceId: provinceA });
    expect(sorted(ids)).toEqual(sorted([F_A_MULTI, F_A_NO_ENROLL]));
    expect((await factoryIds({ provinceId: provinceB })).ids).toEqual([F_B]);
  });

  it("a matching pair returns the province's factories", async () => {
    const { ids } = await factoryIds({ region: regionA, provinceId: provinceA2 });
    expect(ids).toEqual([F_A2]);
  });

  it("a mismatched pair is empty with total 0, so the region is not ignored", async () => {
    expect((await factoryIds({ provinceId: provinceA })).ids.length).toBeGreaterThan(0);
    const mismatched = await factoryIds({ region: regionB, provinceId: provinceA });
    expect(mismatched.all).toEqual([]);
    expect(mismatched.total).toBe(0);
  });

  it("an unknown region or province is empty", async () => {
    const unknownRegion = await factoryIds({ region: UNKNOWN_REGION });
    expect(unknownRegion.all).toEqual([]);
    expect(unknownRegion.total).toBe(0);
    const unknownProvince = await factoryIds({ provinceId: UNKNOWN_PROVINCE });
    expect(unknownProvince.all).toEqual([]);
    expect(unknownProvince.total).toBe(0);
  });

  it("no filters returns every validated factory, across regions", async () => {
    const { ids, all, total } = await factoryIds();
    expect(sorted(ids)).toEqual(sorted([F_A_MULTI, F_A2, F_B, F_A_NO_ENROLL]));
    expect(total).toBe(all.length);
  });

  it("combines with validated", async () => {
    const { ids } = await factoryIds({ validated: false, region: regionA });
    expect(ids).toEqual([F_A_UNVALIDATED]);
    expect((await factoryIds({ validated: false, region: regionB })).ids).toEqual([]);
  });

  it("combines with enrolled and fiscalYear", async () => {
    const enrolled = await factoryIds({ enrolled: true, region: regionA, fiscalYear: currentYear });
    expect(sorted(enrolled.ids)).toEqual(sorted([F_A_MULTI, F_A2]));
    const previous = await factoryIds({
      enrolled: true,
      region: regionA,
      fiscalYear: previousYear,
    });
    expect(previous.ids).toEqual([F_A_MULTI]);
    const byProvince = await factoryIds({
      enrolled: true,
      provinceId: provinceA,
      fiscalYear: currentYear,
    });
    expect(byProvince.ids).toEqual([F_A_MULTI]);
  });

  it("paginates the filtered set and total reflects the filter", async () => {
    const first = await factoryService.getAllFactories({
      validated: true,
      region: regionA,
      page: 1,
      limit: 1,
    });
    expect(first.items).toHaveLength(1);
    expect(first.meta.total).toBeGreaterThanOrEqual(3);
    const everything = await drain((pg) =>
      factoryService.getAllFactories({ validated: true, region: regionA, ...pg }),
    );
    expect(first.meta.total).toBe(everything.items.length);
    const accountIds = everything.items as unknown as Array<{ account_id: number }>;
    expect(new Set(accountIds.map((i) => i.account_id)).size).toBe(everything.items.length);
  });
});

describe("admin enrollment list — region and province filters", () => {
  it("region alone returns only enrollments in that health region", async () => {
    const { ids, all, total } = await enrollIdsOf({ region: regionA, fiscalYear: currentYear });
    expect(sorted(ids)).toEqual(sorted([enrollAFinished, enrollA2NoCover]));
    expect(total).toBe(all.length);
  });

  it("province alone returns only enrollments in that province", async () => {
    expect((await enrollIdsOf({ provinceId: provinceA, fiscalYear: currentYear })).ids).toEqual([
      enrollAFinished,
    ]);
    expect((await enrollIdsOf({ provinceId: provinceB, fiscalYear: currentYear })).ids).toEqual([
      enrollBFinished,
    ]);
  });

  it("a matching pair returns the province's enrollments", async () => {
    const { ids } = await enrollIdsOf({
      region: regionA,
      provinceId: provinceA2,
      fiscalYear: currentYear,
    });
    expect(ids).toEqual([enrollA2NoCover]);
  });

  it("a mismatched pair is empty with total 0, so the region is not ignored", async () => {
    expect(
      (await enrollIdsOf({ provinceId: provinceA, fiscalYear: currentYear })).ids.length,
    ).toBeGreaterThan(0);
    const mismatched = await enrollIdsOf({
      region: regionB,
      provinceId: provinceA,
      fiscalYear: currentYear,
    });
    expect(mismatched.all).toEqual([]);
    expect(mismatched.total).toBe(0);
  });

  it("an unknown region or province is empty", async () => {
    const unknownRegion = await enrollIdsOf({ region: UNKNOWN_REGION, fiscalYear: currentYear });
    expect(unknownRegion.all).toEqual([]);
    expect(unknownRegion.total).toBe(0);
    const unknownProvince = await enrollIdsOf({
      provinceId: UNKNOWN_PROVINCE,
      fiscalYear: currentYear,
    });
    expect(unknownProvince.all).toEqual([]);
    expect(unknownProvince.total).toBe(0);
  });

  it("no filters returns every enrollment in the year, across regions", async () => {
    const { ids, all, total } = await enrollIdsOf({ fiscalYear: currentYear });
    expect(sorted(ids)).toEqual(sorted([enrollAFinished, enrollA2NoCover, enrollBFinished]));
    expect(total).toBe(all.length);
  });

  it("combines with coverStatus", async () => {
    expect(
      (await enrollIdsOf({ region: regionA, coverStatus: "finished", fiscalYear: currentYear }))
        .ids,
    ).toEqual([enrollAFinished]);
    expect(
      (await enrollIdsOf({ region: regionA, coverStatus: "none", fiscalYear: currentYear })).ids,
    ).toEqual([enrollA2NoCover]);
    expect(
      (await enrollIdsOf({ region: regionB, coverStatus: "none", fiscalYear: currentYear })).ids,
    ).toEqual([]);
  });

  it("combines with fiscalYear", async () => {
    expect((await enrollIdsOf({ region: regionA, fiscalYear: previousYear })).ids).toEqual([
      enrollAPreviousYear,
    ]);
    expect((await enrollIdsOf({ region: regionB, fiscalYear: previousYear })).ids).toEqual([]);
  });

  it("paginates the filtered set and total reflects the filter", async () => {
    const first = await enrollService.getAllEnrolls(regionA, undefined, undefined, {
      page: 1,
      limit: 1,
      fiscalYear: currentYear,
    });
    expect(first.items).toHaveLength(1);
    const everything = await drain((pg) =>
      enrollService.getAllEnrolls(regionA, undefined, undefined, {
        ...pg,
        fiscalYear: currentYear,
      }),
    );
    expect(first.meta.total).toBe(everything.items.length);
    expect(first.meta.total).toBeGreaterThanOrEqual(2);
  });
});
