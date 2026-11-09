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
} from "../../../drizzle/schema";
import {
  authenticatedGet,
  removeAccount,
  seedEvaluatorAccount,
  signAccessToken,
} from "../../../test/authenticated-request";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[evaluators/factories authenticated integration] SKIPPED, no reachable DATABASE_URL.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

const EVALUATOR_ID = 99930;
const IN_REGION_FACTORY = 99931;
const OUT_OF_REGION_FACTORY = 99932;
const FACTORIES = [IN_REGION_FACTORY, OUT_OF_REGION_FACTORY];
const SEEDED_EVALUATOR_ID = 78;

const ROUTE = "src/routes/evaluators/factories/index.ts";

let region: number;
let provinceInRegion: number;
let provinceOutOfRegion: number;
let token: string;
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

const seedEnrolledFactory = async (accountId: number, provinceId: number) => {
  await db.insert(accounts).values({
    id: accountId,
    username: `test_auth_factory_${accountId}`,
    password: "hashed",
    email: `test_auth_factory_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ authenticated",
    nameEn: "Test Authenticated Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId,
    districtId: geo[provinceId].districtId,
    subdistrictId: geo[provinceId].subdistrictId,
    isValidate: true,
  });
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(now.getFullYear() - 1);
  const enrollValues = (enrollDate: Date) => ({
    factoryId: accountId,
    enrollDate: enrollDate.toISOString(),
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
  await db.insert(enrolls).values(enrollValues(now));
  await db.insert(enrolls).values(enrollValues(yearAgo));
};

const cleanup = async () => {
  for (const id of FACTORIES) {
    await db.delete(enrolls).where(eq(enrolls.factoryId, id));
    await db.delete(factories).where(eq(factories.accountId, id));
    await removeAccount(db, id);
  }
  await removeAccount(db, EVALUATOR_ID);
};

beforeAll(async () => {
  if (!dbReachable) return;

  const rows = await db
    .select({ provinceId: provinces.provinceId, healthRegion: provinces.healthRegion })
    .from(provinces)
    .orderBy(asc(provinces.provinceId));
  region = rows[0].healthRegion;
  provinceInRegion = rows[0].provinceId;
  const outsider = rows.find((p) => p.healthRegion !== region);
  if (!outsider) throw new Error("seed data lacks a second health region");
  provinceOutOfRegion = outsider.provinceId;
  for (const id of [provinceInRegion, provinceOutOfRegion]) geo[id] = await geoOf(id);

  await cleanup();
  const evaluator = await seedEvaluatorAccount(db, { id: EVALUATOR_ID, region });
  token = await signAccessToken(evaluator);
  await seedEnrolledFactory(IN_REGION_FACTORY, provinceInRegion);
  await seedEnrolledFactory(OUT_OF_REGION_FACTORY, provinceOutOfRegion);
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await pool.end().catch(() => {});
});

type ListBody = { items: Array<{ account_id: number }>; meta: { total: number } };

const get = async (query: Record<string, string | number | boolean | undefined>, t = token) => {
  const response = await authenticatedGet(ROUTE, {
    token: t,
    query: { validated: true, ...query },
  });
  return { status: response.status, body: response.json<ListBody>() };
};

const mine = (body: ListBody) =>
  body.items.map((i) => i.account_id).filter((id) => FACTORIES.includes(id));

describeDb("GET evaluators/factories with a real access token", () => {
  it("rejects a request with no token", async () => {
    const response = await authenticatedGet(ROUTE, { query: { validated: true } });
    expect(response.status).toBe(401);
  });

  it("returns the evaluator's own region when no province is sent", async () => {
    const { status, body } = await get({});
    expect(status).toBe(200);
    expect(mine(body)).toEqual([IN_REGION_FACTORY]);
  });

  it("returns the province's factories for an in-region provinceId", async () => {
    const { status, body } = await get({ provinceId: provinceInRegion });
    expect(status).toBe(200);
    expect(mine(body)).toEqual([IN_REGION_FACTORY]);
    expect(body.meta.total).toBe(body.items.length);
  });

  it("returns 200 with no rows and total 0 for an out-of-region provinceId", async () => {
    const { status, body } = await get({ provinceId: provinceOutOfRegion });
    expect(status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it("ignores a region sent by the client and still applies the account's region", async () => {
    const outsiderRegion = await db
      .select({ r: provinces.healthRegion })
      .from(provinces)
      .where(eq(provinces.provinceId, provinceOutOfRegion))
      .then((r) => r[0].r);
    const { status, body } = await get({ region: outsiderRegion });
    expect(status).toBe(200);
    expect(mine(body)).toEqual([IN_REGION_FACTORY]);
  });
});
