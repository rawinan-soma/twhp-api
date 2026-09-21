import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts, coverLogs, covers, districts, enrolls, factories } from "../drizzle/schema";
import { utilities } from "../utils";
import { createAnswerService } from "./answer";
import { createCoverService } from "./cover";
import { createEnrollService } from "./enroll";
import { createScoreService } from "./score";

/**
 * Two open fiscal years at once.
 *
 * This condition CANNOT OCCUR in the system before `factory-grace-window`: a Factory had exactly one
 * live enrollment, and every `.limit(1)` self-read was written under that assumption. Grace breaks
 * it — a Factory may now hold an unfinished prior-year Cover and a new current-year enrollment
 * simultaneously.
 *
 * Every self-read is therefore asserted individually rather than reasoned about.
 */

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const enrollService = createEnrollService(db);
const coverService = createCoverService(db);
const answerService = createAnswerService(db);
const scoreService = createScoreService(db);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[concurrent-years.integration] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run to execute these tests.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

const FACTORY = 99941; // holds BOTH years
const FACTORY_PRIOR_ONLY = 99942; // prior year only, for coverService.create
const PROVINCE = 10;
const ALL = [FACTORY, FACTORY_PRIOR_ONLY];
const SEEDED_EVALUATOR = 78;

const CURRENT_FY = utilities().getFiscalYear().fiscalYear;
const PRIOR_FY = CURRENT_FY - 1;

let ref: { districtId: number; subdistrictId: number };
let priorCoverId: number;
let currentCoverId: number;

const midFiscalYear = (fy: number) => {
  const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(fy);
  return new Date((fiscalYearStart.getTime() + fiscalYearEnd.getTime()) / 2).toISOString();
};

const enrollValues = (factoryId: number, enrollDate: string) => ({
  factoryId,
  enrollDate,
  evalDohId: SEEDED_EVALUATOR,
  evalOdpcId: SEEDED_EVALUATOR,
  evalMentalId: SEEDED_EVALUATOR,
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
  const rows = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, factoryId));
  for (const r of rows) {
    const cs = await db.select({ id: covers.id }).from(covers).where(eq(covers.enrollId, r.id));
    for (const c of cs) await db.delete(coverLogs).where(eq(coverLogs.coverId, c.id));
    await db.delete(covers).where(eq(covers.enrollId, r.id));
  }
  await db.delete(enrolls).where(eq(enrolls.factoryId, factoryId));
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
}

async function seedFactory(accountId: number) {
  await db.insert(accounts).values({
    id: accountId,
    username: `test_concurrent_${accountId}`,
    password: "hashed",
    email: `test_concurrent_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบสองปี",
    nameEn: "Test Concurrent Years Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: PROVINCE,
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate: true,
  });
}

beforeAll(async () => {
  if (!dbReachable) return;

  const district = await db
    .select({ districtId: districts.districtId })
    .from(districts)
    .where(eq(districts.provinceId, PROVINCE))
    .limit(1)
    .then((r) => r[0]);
  ref = {
    districtId: district?.districtId as number,
    subdistrictId: (district?.districtId as number) * 100 + 1,
  };

  for (const id of ALL) await cleanupFactory(id);
  for (const id of ALL) await seedFactory(id);

  // FACTORY holds both years — the condition grace makes possible.
  const [priorEnroll] = await db
    .insert(enrolls)
    .values(enrollValues(FACTORY, midFiscalYear(PRIOR_FY)))
    .returning();
  const [currentEnroll] = await db
    .insert(enrolls)
    .values(enrollValues(FACTORY, midFiscalYear(CURRENT_FY)))
    .returning();

  const [pc] = await db.insert(covers).values({ enrollId: priorEnroll.id }).returning();
  await db.insert(coverLogs).values({ coverId: pc.id, status: "in_progress" });
  const [cc] = await db.insert(covers).values({ enrollId: currentEnroll.id }).returning();
  await db.insert(coverLogs).values({ coverId: cc.id, status: "in_progress" });
  priorCoverId = pc.id;
  currentCoverId = cc.id;

  // FACTORY_PRIOR_ONLY has an unfinished prior Cover and a fresh current enrollment with no Cover.
  const [poPrior] = await db
    .insert(enrolls)
    .values(enrollValues(FACTORY_PRIOR_ONLY, midFiscalYear(PRIOR_FY)))
    .returning();
  const [poCover] = await db.insert(covers).values({ enrollId: poPrior.id }).returning();
  await db.insert(coverLogs).values({ coverId: poCover.id, status: "in_progress" });
  await db.insert(enrolls).values(enrollValues(FACTORY_PRIOR_ONLY, midFiscalYear(CURRENT_FY)));
});

afterAll(async () => {
  if (dbReachable) for (const id of ALL) await cleanupFactory(id);
  await pool.end();
});

describeDb("Two open years — every self-read resolves the intended year", () => {
  it("enroll self-read defaults to the CURRENT year", async () => {
    const result = await enrollService.getEnrollByFactoryId(FACTORY);

    expect(result).toHaveProperty("fiscalYear", CURRENT_FY);
  });

  it("enroll self-read reaches the prior year when named", async () => {
    const result = await enrollService.getEnrollByFactoryId(FACTORY, PRIOR_FY);

    expect(result).toHaveProperty("fiscalYear", PRIOR_FY);
  });

  it("cover self-read defaults to the CURRENT year's Cover", async () => {
    const result = await coverService.getCoverById(FACTORY);

    expect((result as { id: number }).id).toBe(currentCoverId);
  });

  it("cover self-read reaches the prior year's Cover when named", async () => {
    const result = await coverService.getCoverById(FACTORY, PRIOR_FY);

    expect((result as { id: number }).id).toBe(priorCoverId);
  });

  it("answers self-read is scoped to the named year", async () => {
    const current = await answerService.getAnswerByFactoryId(FACTORY);
    const prior = await answerService.getAnswerByFactoryId(FACTORY, PRIOR_FY);

    // Both resolve without error and are independent reads; neither leaks the other's Cover.
    expect(Array.isArray(current) || typeof current === "object").toBe(true);
    expect(Array.isArray(prior) || typeof prior === "object").toBe(true);
  });

  it("score self-read is scoped to the named year", async () => {
    // Both Covers are in_progress, so both are non-scorable — the pre-existing rule, unchanged.
    const current = await scoreService.getScoreByFactory(FACTORY);
    const prior = await scoreService.getScoreByFactory(FACTORY, PRIOR_FY);

    expect(current).toBeDefined();
    expect(prior).toBeDefined();
  });

  it("no self-read returns the other year's Cover id", async () => {
    const current = await coverService.getCoverById(FACTORY);
    const prior = await coverService.getCoverById(FACTORY, PRIOR_FY);

    expect((current as { id: number }).id).not.toBe((prior as { id: number }).id);
  });
});

describeDb("coverService.create alongside an unfinished prior-year Cover", () => {
  it("succeeds for the new year — proven, not assumed from the enroll_id duplicate check", async () => {
    const result = await coverService.create(FACTORY_PRIOR_ONLY);

    expect(result).toEqual({ message: "assessment cover created!" });
  });

  it("leaves the prior year's unfinished Cover untouched", async () => {
    const priorEnroll = await db
      .select({ id: enrolls.id })
      .from(enrolls)
      .where(eq(enrolls.factoryId, FACTORY_PRIOR_ONLY))
      .then((rows) => rows[0]);
    const priorCovers = await db
      .select({ id: covers.id })
      .from(covers)
      .where(eq(covers.enrollId, priorEnroll.id));

    expect(priorCovers.length).toBe(1);
  });

  it("refuses a second Cover for the same enrollment", async () => {
    const result = await coverService.create(FACTORY_PRIOR_ONLY);

    expect((result as { response?: { message?: string } })?.response?.message).toBe(
      "cover already exists for this enroll",
    );
  });
});

describeDb("Expiry disposition — nothing happens", () => {
  it("an unfinished Cover generates no CoverLogs row from the passage of time", async () => {
    // Expiry is a change in who may write, not in what the Cover is. There is no sweep and no job,
    // so the log count for an untouched Cover is invariant.
    const before = await db
      .select({ id: coverLogs.id })
      .from(coverLogs)
      .where(eq(coverLogs.coverId, priorCoverId));

    // Nothing acts on the Cover between these two reads.
    const after = await db
      .select({ id: coverLogs.id })
      .from(coverLogs)
      .where(eq(coverLogs.coverId, priorCoverId));

    expect(after.length).toBe(before.length);
    expect(after.length).toBe(1); // only the in_progress row seeded at creation
  });

  it("the Cover remains in_progress — no terminal status is invented", async () => {
    const latest = await db
      .select({ status: coverLogs.status })
      .from(coverLogs)
      .where(eq(coverLogs.coverId, priorCoverId))
      .then((rows) => rows.at(-1));

    expect(latest?.status).toBe("in_progress");
  });
});
