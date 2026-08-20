import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts, districts, enrolls, factories, provinces } from "../drizzle/schema";
import {
  AdminFactoryListItemSchema,
  FactoryListItemSchema,
  ProvincialFactoryListItemSchema,
} from "../schema/factory";
import { Paginated } from "../schema/pagination";
import { utilities } from "../utils";
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
    "[factory-pagination.integration] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run to execute these tests.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

// ─── Fixture constants ───────────────────────────────────────────────────────
//
// FACTORY_MULTI is the ADR-0008 fixture: one factory with THREE enrollments across three fiscal
// years. Under the previous join it produced three identical rows. It is the only fixture that
// distinguishes the EXISTS rewrite from the old behaviour, so it must exist for the parity
// assertions to prove anything.

const FACTORY_MULTI = 99981; // 3 enrollments across 3 fiscal years
const FACTORY_CURRENT = 99982; // 1 enrollment, current fiscal year
const FACTORY_NONE = 99983; // no enrollment at all
const FACTORY_UNVALIDATED = 99984; // is_validate = false
const PROVINCE_A = 10;

const ALL = [FACTORY_MULTI, FACTORY_CURRENT, FACTORY_NONE, FACTORY_UNVALIDATED];

let regionA: number;
let ref: { districtId: number; subdistrictId: number };

const SEEDED_EVALUATOR_ID = 78; // seeded ODPC evaluator (FK target for enroll eval_* ids)

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

async function seedFactory(accountId: number, isValidate = true) {
  await db.insert(accounts).values({
    id: accountId,
    username: `test_pagination_${accountId}`,
    password: "hashed",
    email: `test_pagination_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ pagination",
    nameEn: "Test Pagination Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: PROVINCE_A,
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate,
  });
}

beforeAll(async () => {
  if (!dbReachable) return;
  const province = await db
    .select({ region: provinces.healthRegion })
    .from(provinces)
    .where(eq(provinces.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0]);
  regionA = province!.region;

  const district = await db
    .select({ districtId: districts.districtId })
    .from(districts)
    .where(eq(districts.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0]);
  ref = { districtId: district!.districtId, subdistrictId: district!.districtId * 100 + 1 };

  for (const id of ALL) await cleanupFactory(id);

  await seedFactory(FACTORY_MULTI);
  await seedFactory(FACTORY_CURRENT);
  await seedFactory(FACTORY_NONE);
  await seedFactory(FACTORY_UNVALIDATED, false);

  const { fiscalYearStart } = utilities().getFiscalYear();
  const thisYear = fiscalYearStart.toISOString();
  const lastYear = new Date(fiscalYearStart.getFullYear() - 1, 9, 1).toISOString();
  const twoYearsAgo = new Date(fiscalYearStart.getFullYear() - 2, 9, 1).toISOString();

  // THE ADR-0008 fixture: three enrollments for one factory.
  await db.insert(enrolls).values(enrollValues(FACTORY_MULTI, thisYear));
  await db.insert(enrolls).values(enrollValues(FACTORY_MULTI, lastYear));
  await db.insert(enrolls).values(enrollValues(FACTORY_MULTI, twoYearsAgo));
  await db.insert(enrolls).values(enrollValues(FACTORY_CURRENT, thisYear));
});

afterAll(async () => {
  if (dbReachable) {
    for (const id of ALL) await cleanupFactory(id);
  }
  await pool.end().catch(() => {});
});

const idsOf = (page: { items: Array<{ account_id: number }> }) =>
  page.items.map((i) => i.account_id);

const seededOnly = (ids: number[]) => ids.filter((id) => ALL.includes(id));

// ─── ADR-0008: the EXISTS rewrite must not multiply rows ─────────────────────

describeDb("ADR-0008 — factory rows are never multiplied by enrollments", () => {
  it("AC1: a factory with 3 enrollments appears exactly once (enrolled omitted)", async () => {
    const page = await factoryService.getAllFactories({ validated: true, limit: 100 });
    const occurrences = idsOf(page).filter((id) => id === FACTORY_MULTI).length;
    expect(occurrences).toBe(1);
  });

  it("AC2: a factory with 3 enrollments appears exactly once (enrolled=true)", async () => {
    const page = await factoryService.getAllFactories({
      validated: true,
      enrolled: true,
      limit: 100,
    });
    expect(idsOf(page).filter((id) => id === FACTORY_MULTI).length).toBe(1);
  });

  it("AC3: region variant does not multiply either", async () => {
    const page = await factoryService.getAllFactoriesByRegion({
      validated: true,
      enrolled: false,
      region: regionA,
      limit: 100,
    });
    expect(idsOf(page).filter((id) => id === FACTORY_MULTI).length).toBe(1);
  });

  it("AC4: province variant does not multiply either", async () => {
    const page = await factoryService.getAllFactoriesByProvinceId({
      validated: true,
      enrolled: false,
      provinceId: PROVINCE_A,
      limit: 100,
    });
    expect(idsOf(page).filter((id) => id === FACTORY_MULTI).length).toBe(1);
  });

  it("AC5: total counts distinct factories, matching the number of distinct ids returned", async () => {
    const page = await factoryService.getAllFactories({ validated: true, limit: 100 });
    expect(page.meta.total).toBe(new Set(idsOf(page)).size);
  });
});

// ─── ADR-0008: filter SELECTION semantics are preserved ──────────────────────

describeDb("ADR-0008 — which factories are selected is unchanged", () => {
  it("AC1: admin + enrolled omitted includes a factory with no enrollment (was leftJoin)", async () => {
    const page = await factoryService.getAllFactories({ validated: true, limit: 100 });
    expect(idsOf(page)).toContain(FACTORY_NONE);
  });

  it("AC2: admin + enrolled=true excludes a factory with no current-year enrollment", async () => {
    const page = await factoryService.getAllFactories({
      validated: true,
      enrolled: true,
      limit: 100,
    });
    expect(idsOf(page)).not.toContain(FACTORY_NONE);
    expect(idsOf(page)).toContain(FACTORY_CURRENT);
  });

  it("AC3: region + enrolled=false still requires at least one enrollment (was innerJoin)", async () => {
    const page = await factoryService.getAllFactoriesByRegion({
      validated: true,
      enrolled: false,
      region: regionA,
      limit: 100,
    });
    expect(idsOf(page)).not.toContain(FACTORY_NONE);
    expect(idsOf(page)).toContain(FACTORY_MULTI);
  });

  it("AC4: province + enrolled=false still requires at least one enrollment (was innerJoin)", async () => {
    const page = await factoryService.getAllFactoriesByProvinceId({
      validated: true,
      enrolled: false,
      provinceId: PROVINCE_A,
      limit: 100,
    });
    expect(idsOf(page)).not.toContain(FACTORY_NONE);
  });

  it("AC5: validated filter is unchanged", async () => {
    const validated = await factoryService.getAllFactories({ validated: true, limit: 100 });
    const unvalidated = await factoryService.getAllFactories({ validated: false, limit: 100 });
    expect(idsOf(validated)).not.toContain(FACTORY_UNVALIDATED);
    expect(idsOf(unvalidated)).toContain(FACTORY_UNVALIDATED);
  });
});

// ─── Story 004: factory list pagination ──────────────────────────────────────

describeDb("Story 004 — Factory list pagination", () => {
  it("AC1: admin response validates against the paginated admin item schema", async () => {
    const page = await factoryService.getAllFactories({ validated: true, limit: 5 });
    expect(Value.Check(Paginated(AdminFactoryListItemSchema), page)).toBe(true);
  });

  it("AC2: evaluator response validates against the paginated item schema", async () => {
    const page = await factoryService.getAllFactoriesByRegion({
      validated: true,
      region: regionA,
      limit: 5,
    });
    expect(Value.Check(Paginated(FactoryListItemSchema), page)).toBe(true);
  });

  it("AC3: provincial response validates against its non-nullable-name item schema", async () => {
    const page = await factoryService.getAllFactoriesByProvinceId({
      validated: true,
      provinceId: PROVINCE_A,
      limit: 5,
    });
    expect(Value.Check(Paginated(ProvincialFactoryListItemSchema), page)).toBe(true);
  });

  it("AC4: items never exceed limit", async () => {
    const page = await factoryService.getAllFactories({ validated: true, limit: 2 });
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.meta.limit).toBe(2);
  });

  it("AC5: defaults apply when page and limit are omitted", async () => {
    const page = await factoryService.getAllFactories({ validated: true });
    expect(page.meta.page).toBe(1);
    expect(page.meta.limit).toBe(20);
    expect(page.items.length).toBeLessThanOrEqual(20);
  });

  it("AC6: totalPages = ceil(total / limit)", async () => {
    const page = await factoryService.getAllFactories({ validated: true, limit: 3 });
    expect(page.meta.totalPages).toBe(Math.ceil(page.meta.total / 3));
  });

  it("AC7: a page beyond the end returns 200-shaped empty items with accurate meta", async () => {
    const first = await factoryService.getAllFactories({ validated: true, limit: 5 });
    const beyond = await factoryService.getAllFactories({
      validated: true,
      limit: 5,
      page: first.meta.totalPages + 10,
    });
    expect(beyond.items).toEqual([]);
    expect(beyond.meta.total).toBe(first.meta.total);
  });

  it("AC8: page stability — iterating every page yields each row exactly once", async () => {
    const limit = 2;
    const first = await factoryService.getAllFactoriesByProvinceId({
      validated: true,
      enrolled: false,
      provinceId: PROVINCE_A,
      limit,
    });
    const collected: number[] = [];
    for (let page = 1; page <= first.meta.totalPages; page++) {
      const p = await factoryService.getAllFactoriesByProvinceId({
        validated: true,
        enrolled: false,
        provinceId: PROVINCE_A,
        limit,
        page,
      });
      collected.push(...idsOf(p));
    }
    expect(collected.length).toBe(first.meta.total);
    expect(new Set(collected).size).toBe(collected.length);
    expect([...collected]).toEqual([...collected].sort((a, b) => a - b));
  });

  it("AC9: region scoping still bounds the result and its total", async () => {
    const page = await factoryService.getAllFactoriesByRegion({
      validated: true,
      enrolled: false,
      region: regionA,
      limit: 100,
    });
    expect(seededOnly(idsOf(page)).length).toBeGreaterThan(0);
    expect(page.meta.total).toBeGreaterThanOrEqual(seededOnly(idsOf(page)).length);
  });

  it("AC10: province scoping still bounds the result and its total", async () => {
    const page = await factoryService.getAllFactoriesByProvinceId({
      validated: true,
      enrolled: false,
      provinceId: PROVINCE_A,
      limit: 100,
    });
    expect(seededOnly(idsOf(page)).length).toBeGreaterThan(0);
  });
});
