import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  answerLogs,
  answers,
  coverLogs,
  covers,
  enrolls,
  factories,
} from "../drizzle/schema";
import { emailQueue } from "../queue/email";
import { createEvaluatorReviewService } from "./evaluator-review";

// ─── Test DB ─────────────────────────────────────────────────────────────────
// Integration tests for bolt 022 (intent 009 — standard files in the cover-review read).
// Every case derives from a story 001–004 acceptance criterion. Seed data has NO standard
// files, so this suite seeds enroll `standard*` + `fileStandard*Url` on its own fixture.

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const reviewService = createEvaluatorReviewService(db);

const TEST_FACTORY_ACCOUNT_ID = 99956; // distinct from other integration tests
const TEST_PROVINCE_ID = 10; // seeded province in health region 13
const COVER_REGION = 13; // = provinces(10).health_region
const SEEDED_ODPC_ID = 78; // seeded ODPC (for enroll FKs)

const mentalCtx = { accountId: 80001, level: "Mental" as const, region: COVER_REGION };
const odpcCtx = { accountId: 80002, level: "ODPC" as const, region: COVER_REGION };
const adminCtx = { accountId: 80003, level: "ODPC" as const, region: null };

const CATEGORY_QUESTION: Record<string, number> = {
  Collaborate: 1,
  Disease: 12,
  Safety: 23,
  Mental: 36,
  Outcome: 38,
};

const code = (r: unknown) => (r as { code: number }).code;
const body = (r: unknown) =>
  (
    r as {
      response: {
        answers: { category: string }[];
        standards: { standard: string; fileName: string }[];
      };
    }
  ).response;

let coverWithAnswers: number;
let coverNoAnswers: number;

async function cleanupFactory() {
  const prevEnrolls = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, TEST_FACTORY_ACCOUNT_ID));
  for (const e of prevEnrolls) {
    const prevCovers = await db
      .select({ id: covers.id })
      .from(covers)
      .where(eq(covers.enrollId, e.id));
    for (const c of prevCovers) {
      const aIds = await db
        .select({ id: answers.id })
        .from(answers)
        .where(eq(answers.coverId, c.id))
        .then((rows) => rows.map((r) => r.id));
      if (aIds.length > 0) await db.delete(answerLogs).where(inArray(answerLogs.answerId, aIds));
      await db.delete(answers).where(eq(answers.coverId, c.id));
      await db.delete(coverLogs).where(eq(coverLogs.coverId, c.id));
      await db.delete(covers).where(eq(covers.id, c.id));
    }
    await db.delete(enrolls).where(eq(enrolls.id, e.id));
  }
  await db.delete(factories).where(eq(factories.accountId, TEST_FACTORY_ACCOUNT_ID));
  await db.delete(accounts).where(eq(accounts.id, TEST_FACTORY_ACCOUNT_ID));
}

beforeAll(async () => {
  await cleanupFactory();

  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);

  await db.insert(accounts).values({
    id: TEST_FACTORY_ACCOUNT_ID,
    username: "test_factory_standards",
    password: "hashed",
    email: "test_factory_standards@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: TEST_FACTORY_ACCOUNT_ID,
    factoryType: 1,
    nameTh: "โรงงานทดสอบมาตรฐาน",
    nameEn: "Test Standards Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: TEST_PROVINCE_ID,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: true,
  });

  // Standards config (seeded directly, bypassing the enroll API guard):
  //   HC        claimed + file        → INCLUDED
  //   ISO45001  claimed + file        → INCLUDED
  //   SAN       claimed, NO file      → EXCLUDED (gap)
  //   Safety    NOT claimed, stray file → EXCLUDED
  //   others    not claimed, no file  → excluded
  const [enroll] = await db
    .insert(enrolls)
    .values({
      factoryId: TEST_FACTORY_ACCOUNT_ID,
      evalDohId: SEEDED_ODPC_ID,
      evalOdpcId: SEEDED_ODPC_ID,
      evalMentalId: SEEDED_ODPC_ID,
      employeeThM: 10,
      employeeMmM: 0,
      employeeKhM: 0,
      employeeLaM: 0,
      employeeVnM: 0,
      employeeCnM: 0,
      employeePhM: 0,
      employeeJpM: 0,
      employeeInM: 0,
      employeeOtherM: 0,
      employeeThF: 5,
      employeeMmF: 0,
      employeeKhF: 0,
      employeeLaF: 0,
      employeeVnF: 0,
      employeeCnF: 0,
      employeePhF: 0,
      employeeJpF: 0,
      employeeInF: 0,
      employeeOtherF: 0,
      standardHc: true,
      fileStandardHcUrl: "hc.pdf",
      standardSan: true,
      fileStandardSanUrl: null,
      standardSanPlus: false,
      standardWellness: false,
      standardSafety: false,
      fileStandardSafetyUrl: "stray-safety.pdf",
      standardTis18001: false,
      standardIso45001: true,
      fileStandardIso45001Url: "iso45001.pdf",
      standardIso14001: false,
      standardZero: false,
      standard5S: false,
      standardHas: false,
      safetyOfficerPrefix: "นาย",
      safetyOfficerFirstName: "ทดสอบ",
      safetyOfficerLastName: "ทดสอบ",
      safetyOfficerPosition: "เจ้าหน้าที่",
    })
    .returning();

  const [cA] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  coverWithAnswers = cA.id;
  for (const cat of Object.keys(CATEGORY_QUESTION)) {
    const [ans] = await db
      .insert(answers)
      .values({
        questionId: CATEGORY_QUESTION[cat],
        coverId: coverWithAnswers,
        selectedChoice: "2",
      })
      .returning();
    await db.insert(answerLogs).values({ answerId: ans.id, status: "in_review" });
  }

  const [cB] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  coverNoAnswers = cB.id; // no answers seeded
});

afterAll(async () => {
  await cleanupFactory();
  await emailQueue.close();
  await pool.end();
});

const EXPECTED_STANDARDS = [
  { standard: "standardHC", fileName: "hc.pdf" },
  { standard: "standardISO45001", fileName: "iso45001.pdf" },
];

describe("Story 001–004 — standard files in the cover-review read", () => {
  it("AC: only claimed + uploaded standards are returned (claimed-no-file and not-claimed-with-file excluded)", async () => {
    const res = await reviewService.getAnswers(coverWithAnswers, odpcCtx);
    expect(code(res)).toBe(200);
    expect(body(res).standards).toEqual(EXPECTED_STANDARDS);
    // SAN (claimed, no file) and Safety (not claimed, stray file) are absent.
    const keys = body(res).standards.map((s) => s.standard);
    expect(keys).not.toContain("standardSAN");
    expect(keys).not.toContain("standardSafety");
  });

  it("AC: response shape is { answers, standards } and answers is unchanged (all 5 categories for ODPC)", async () => {
    const res = await reviewService.getAnswers(coverWithAnswers, odpcCtx);
    expect(Array.isArray(body(res).answers)).toBe(true);
    expect(new Set(body(res).answers.map((a) => a.category))).toEqual(
      new Set(Object.keys(CATEGORY_QUESTION)),
    );
    expect(Array.isArray(body(res).standards)).toBe(true);
  });

  it("AC: standards are factory-level — a tier-1 (Mental) reviewer sees ALL claimed standards despite category-scoped answers", async () => {
    const res = await reviewService.getAnswers(coverWithAnswers, mentalCtx);
    expect(code(res)).toBe(200);
    // answers filtered to Mental...
    expect(body(res).answers.every((a) => a.category === "Mental")).toBe(true);
    expect(body(res).answers).toHaveLength(1);
    // ...standards NOT filtered.
    expect(body(res).standards).toEqual(EXPECTED_STANDARDS);
  });

  it("AC: a cover with no in-scope answers still returns standards", async () => {
    const res = await reviewService.getAnswers(coverNoAnswers, odpcCtx);
    expect(code(res)).toBe(200);
    expect(body(res).answers).toEqual([]);
    expect(body(res).standards).toEqual(EXPECTED_STANDARDS);
  });

  it("AC: both surfaces identical — an admin (region null) returns the same standards as a regional ODPC", async () => {
    const evalRes = await reviewService.getAnswers(coverWithAnswers, odpcCtx);
    const adminRes = await reviewService.getAnswers(coverWithAnswers, adminCtx);
    expect(code(adminRes)).toBe(200);
    expect(body(adminRes).standards).toEqual(body(evalRes).standards);
  });

  it("AC: cover access is unchanged — a wrong-region ODPC → 404, no standards leaked", async () => {
    const res = await reviewService.getAnswers(coverWithAnswers, {
      accountId: 80002,
      level: "ODPC",
      region: 1, // a region the cover does NOT belong to
    });
    expect(code(res)).toBe(404);
  });
});
