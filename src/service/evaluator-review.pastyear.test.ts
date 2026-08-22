import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts, coverLogs, covers, districts, enrolls, factories } from "../drizzle/schema";
import { utilities } from "../utils";
import { adminReviewerContext, createEvaluatorReviewService } from "./evaluator-review";

/**
 * The fiscal-year write gate: a closed year is writable only by ODPC.
 *
 * TEST STRATEGY — the gate runs AFTER `assertCoverAccess` and BEFORE the Answer lookup. That
 * ordering lets both branches be exercised without Answer or Question fixtures:
 *   - blocked  -> the closed-year 403
 *   - allowed  -> anything else (the Answer lookup then fails, which is the point: the gate let it through)
 *
 * The current-year cases matter most. Mental and DOH do legitimate review work right now, and a gate
 * written as "ODPC only" without the year condition would satisfy the requirement's wording while
 * breaking the system.
 */

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const service = createEvaluatorReviewService(db);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[evaluator-review.pastyear] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run to execute these tests.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

// Seeded evaluators, all in health region 1.
const ODPC = { accountId: 78, level: "ODPC" as const, region: 1 };
const MENTAL = { accountId: 90, level: "Mental" as const, region: 1 };
const DOH = { accountId: 102, level: "DOH" as const, region: 1 };
const ODPC_OTHER_REGION = { accountId: 78, level: "ODPC" as const, region: 9 };

const PROVINCE_REGION_1 = 50; // เชียงใหม่
const FACTORY = 99961;
const CURRENT_FY = utilities().getFiscalYear().fiscalYear;
const PRIOR_FY = CURRENT_FY - 1;

let currentCoverId: number;
let priorCoverId: number;
let ref: { districtId: number; subdistrictId: number };

const midFiscalYear = (fy: number) => {
  const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(fy);
  return new Date((fiscalYearStart.getTime() + fiscalYearEnd.getTime()) / 2).toISOString();
};

const enrollValues = (enrollDate: string) => ({
  factoryId: FACTORY,
  enrollDate,
  evalDohId: DOH.accountId,
  evalOdpcId: ODPC.accountId,
  evalMentalId: MENTAL.accountId,
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
    .where(eq(enrolls.factoryId, FACTORY));

  for (const r of rows) {
    // CoverLogs references Covers with onDelete: "no action", so logs must be removed first.
    // A finalize that passes the year gate writes one — which is exactly what these tests exercise.
    const coverRows = await db
      .select({ id: covers.id })
      .from(covers)
      .where(eq(covers.enrollId, r.id));
    for (const c of coverRows) await db.delete(coverLogs).where(eq(coverLogs.coverId, c.id));
    await db.delete(covers).where(eq(covers.enrollId, r.id));
  }

  await db.delete(enrolls).where(eq(enrolls.factoryId, FACTORY));
  await db.delete(factories).where(eq(factories.accountId, FACTORY));
  await db.delete(accounts).where(eq(accounts.id, FACTORY));
}

beforeAll(async () => {
  if (!dbReachable) return;

  const district = await db
    .select({ districtId: districts.districtId })
    .from(districts)
    .where(eq(districts.provinceId, PROVINCE_REGION_1))
    .limit(1)
    .then((r) => r[0]);
  ref = {
    districtId: district?.districtId as number,
    subdistrictId: (district?.districtId as number) * 100 + 1,
  };

  await cleanup();
  await db.insert(accounts).values({
    id: FACTORY,
    username: `test_pastyear_${FACTORY}`,
    password: "hashed",
    email: `test_pastyear_${FACTORY}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: FACTORY,
    factoryType: 1,
    nameTh: "โรงงานทดสอบปีปิด",
    nameEn: "Test Closed Year Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "50000",
    phoneNumber: "0000000000",
    provinceId: PROVINCE_REGION_1,
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate: true,
  });

  const [currentEnroll] = await db
    .insert(enrolls)
    .values(enrollValues(midFiscalYear(CURRENT_FY)))
    .returning();
  const [priorEnroll] = await db
    .insert(enrolls)
    .values(enrollValues(midFiscalYear(PRIOR_FY)))
    .returning();

  const [c1] = await db.insert(covers).values({ enrollId: currentEnroll.id }).returning();
  const [c2] = await db.insert(covers).values({ enrollId: priorEnroll.id }).returning();
  currentCoverId = c1.id;
  priorCoverId = c2.id;
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await pool.end();
});

/** The gate's refusal, distinguishable from every other failure on these paths. */
const isClosedYearRefusal = (result: unknown) =>
  typeof (result as { message?: string })?.message === "string" &&
  (result as { message: string }).message.includes("is closed; only ODPC may write");

const messageOf = (result: unknown) => {
  // Elysia status responses carry their body on `.response`; plain returns carry it directly.
  const r = result as { response?: { message?: string }; message?: string };
  return r?.response?.message ?? r?.message;
};

describeDb("saveAnswerVerdict — closed fiscal year", () => {
  const body = { outcome: "approve" as const };

  it("refuses a Mental evaluator", async () => {
    const result = await service.saveAnswerVerdict(priorCoverId, 1, MENTAL, body);

    expect(messageOf(result)).toContain(`fiscal year ${PRIOR_FY} is closed`);
  });

  it("refuses a DOH evaluator", async () => {
    const result = await service.saveAnswerVerdict(priorCoverId, 1, DOH, body);

    expect(messageOf(result)).toContain(`fiscal year ${PRIOR_FY} is closed`);
  });

  it("allows a native ODPC evaluator through the gate", async () => {
    // Reaching the Answer lookup is positive proof the gate let the caller through — that lookup
    // sits immediately downstream of it.
    const result = await service.saveAnswerVerdict(priorCoverId, 1, ODPC, body);

    expect(messageOf(result)).toBe("answer not found in this cover");
  });

  it("allows a DOED admin, which is modelled as a national ODPC", async () => {
    const result = await service.saveAnswerVerdict(priorCoverId, 1, adminReviewerContext(1), body);

    expect(messageOf(result)).toBe("answer not found in this cover");
  });

  it("returns the existing 404 for an out-of-region caller, never the year message", async () => {
    // Ordering matters: the region check runs first, so a caller outside the region must not learn
    // that a Cover exists in a particular year.
    const result = await service.saveAnswerVerdict(priorCoverId, 1, ODPC_OTHER_REGION, body);

    expect(messageOf(result)).toBe("cover not found");
  });

  it("returns the existing 404 for a Cover that does not exist", async () => {
    const result = await service.saveAnswerVerdict(9_999_999, 1, ODPC, body);

    expect(messageOf(result)).toBe("cover not found");
  });
});

describeDb("saveAnswerVerdict — current fiscal year is unaffected", () => {
  const body = { outcome: "approve" as const };

  it("does NOT refuse a Mental evaluator — tier-1 review still works", async () => {
    const result = await service.saveAnswerVerdict(currentCoverId, 1, MENTAL, body);

    expect(messageOf(result)).toBe("answer not found in this cover");
  });

  it("does NOT refuse a DOH evaluator", async () => {
    const result = await service.saveAnswerVerdict(currentCoverId, 1, DOH, body);

    expect(messageOf(result)).toBe("answer not found in this cover");
  });

  it("does NOT refuse an ODPC evaluator", async () => {
    const result = await service.saveAnswerVerdict(currentCoverId, 1, ODPC, body);

    expect(isClosedYearRefusal(result)).toBe(false);
  });
});

describeDb("finalize — gate ordering", () => {
  it("keeps the existing ODPC-only refusal ahead of any year check", async () => {
    // This gate performs no database read, so a non-ODPC caller is refused for its level and never
    // learns anything about the Cover's year.
    const result = await service.finalize(priorCoverId, MENTAL);

    expect(messageOf(result)).toBe("finalize is restricted to ODPC");
  });

  it("lets an ODPC evaluator past the year gate on a closed year", async () => {
    const result = await service.finalize(priorCoverId, ODPC);

    expect(isClosedYearRefusal(result)).toBe(false);
  });

  it("returns the existing 404 for an out-of-region ODPC", async () => {
    const result = await service.finalize(priorCoverId, ODPC_OTHER_REGION);

    expect(messageOf(result)).toBe("cover not found");
  });
});
