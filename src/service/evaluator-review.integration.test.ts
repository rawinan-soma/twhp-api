import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
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
import { AnswerViewSchema } from "../schema/evaluator-review";
import { adminReviewerContext, createEvaluatorReviewService } from "./evaluator-review";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const reviewService = createEvaluatorReviewService(db);

// ─── Fixture constants ───────────────────────────────────────────────────────

const TEST_FACTORY_ACCOUNT_ID = 99951;
const TEST_PROVINCE_ID = 10; // seeded province in health region 13
const COVER_REGION = 13; // = provinces(10).health_region
const WRONG_REGION = 1; // a different region the cover does NOT belong to
const NON_EVALUATOR_ACCOUNT_ID = 99952; // never inserted into Evaluators
const SEEDED_EVALUATOR_ID = 78; // seeded ODPC evaluator, region 1
const SEEDED_EVALUATOR_LEVEL = "ODPC";
const SEEDED_EVALUATOR_REGION = 1;

// one question id per category (from seeded Questions)
const CATEGORY_QUESTION: Record<string, number> = {
  Collaborate: 1,
  Disease: 12,
  Safety: 23,
  Mental: 36,
  Outcome: 38,
};
const ALL_CATEGORIES = Object.keys(CATEGORY_QUESTION);

let coverId: number;
let enrollId: number;

// ─── Fixture setup / teardown ────────────────────────────────────────────────

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

  // borrow a valid district/subdistrict to satisfy FKs (same approach as score test)
  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);

  await db.insert(accounts).values({
    id: TEST_FACTORY_ACCOUNT_ID,
    username: "test_factory_admin_review",
    password: "hashed",
    email: "test_factory_admin_review@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: TEST_FACTORY_ACCOUNT_ID,
    factoryType: 1,
    nameTh: "โรงงานทดสอบแอดมิน",
    nameEn: "Test Admin Review Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: TEST_PROVINCE_ID,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: true,
  });

  const [enroll] = await db
    .insert(enrolls)
    .values({
      factoryId: TEST_FACTORY_ACCOUNT_ID,
      evalDohId: SEEDED_EVALUATOR_ID,
      evalOdpcId: SEEDED_EVALUATOR_ID,
      evalMentalId: SEEDED_EVALUATOR_ID,
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
    })
    .returning();
  enrollId = enroll.id;

  const [cover] = await db.insert(covers).values({ enrollId }).returning();
  coverId = cover.id;

  // one in_review answer per category
  for (const cat of ALL_CATEGORIES) {
    const [ans] = await db
      .insert(answers)
      .values({ questionId: CATEGORY_QUESTION[cat], coverId, selectedChoice: "2" })
      .returning();
    await db.insert(answerLogs).values({ answerId: ans.id, status: "in_review" });
  }
});

afterAll(async () => {
  await cleanupFactory();
  await emailQueue.close();
  await pool.end();
});

// ─── Story 001/002 — adminReviewerContext (pure) ─────────────────────────────

describe("Story 001/002 — adminReviewerContext", () => {
  it("synthesizes a national ODPC context for a DOED admin", () => {
    expect(adminReviewerContext(42)).toEqual({ accountId: 42, level: "ODPC", region: null });
  });
});

// ─── Story 001 — reviewer-context seam ───────────────────────────────────────

describe("Story 001 — reviewer-context seam", () => {
  it("AC: resolveEvaluator(seeded evaluator) → {accountId, level, region}", async () => {
    const ctx = await reviewService.resolveEvaluator(SEEDED_EVALUATOR_ID);
    expect(ctx).not.toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(ctx).toEqual({
      accountId: SEEDED_EVALUATOR_ID,
      level: SEEDED_EVALUATOR_LEVEL,
      region: SEEDED_EVALUATOR_REGION,
    });
  });

  it("AC: resolveEvaluator(non-evaluator) → 404 invalid evaluator", async () => {
    const ctx = await reviewService.resolveEvaluator(NON_EVALUATOR_ACCOUNT_ID);
    expect(ctx).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((ctx as { code: number }).code).toBe(404);
  });

  it("AC: region non-null + correct region → assertCoverInRegion passes (unchanged)", async () => {
    const result = await reviewService.getAnswers(coverId, {
      accountId: SEEDED_EVALUATOR_ID,
      level: "ODPC",
      region: COVER_REGION,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("AC: region non-null + WRONG region → 404 cover not found (still gated)", async () => {
    const result = await reviewService.getAnswers(coverId, {
      accountId: SEEDED_EVALUATOR_ID,
      level: "ODPC",
      region: WRONG_REGION,
    });
    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((result as { code: number }).code).toBe(404);
  });

  it("AC: region null + non-existent cover → 404 cover not found (assertCoverExists)", async () => {
    const result = await reviewService.getAnswers(99999999, adminReviewerContext(1));
    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((result as { code: number }).code).toBe(404);
    expect((result as { response: { message: string } }).response).toMatchObject({
      message: "cover not found",
    });
  });

  it("AC: evaluator category filter is behaviour-preserving (Mental sees only Mental)", async () => {
    const result = await reviewService.getAnswers(coverId, {
      accountId: SEEDED_EVALUATOR_ID,
      level: "Mental",
      region: COVER_REGION,
    });
    expect(Array.isArray(result)).toBe(true);
    const rows = result as Array<{ category: string }>;
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.category === "Mental")).toBe(true);
  });
});

// ─── Story 002 — admin answers (national ODPC) ───────────────────────────────

describe("Story 002 — admin answers endpoint (service path)", () => {
  it("AC: admin (region null) reaches a cover in any region and sees all 5 categories", async () => {
    const result = await reviewService.getAnswers(
      coverId,
      adminReviewerContext(NON_EVALUATOR_ACCOUNT_ID),
    );
    expect(Array.isArray(result)).toBe(true);
    const rows = result as Array<{ category: string }>;
    expect(rows).toHaveLength(ALL_CATEGORIES.length);
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(ALL_CATEGORIES));
  });

  it("AC: admin answer list conforms to AnswerViewSchema (reused schema)", async () => {
    const result = await reviewService.getAnswers(
      coverId,
      adminReviewerContext(NON_EVALUATOR_ACCOUNT_ID),
    );
    expect(Value.Check(AnswerViewSchema, result)).toBe(true);
  });

  it("AC: admin + non-existent cover → 404", async () => {
    const result = await reviewService.getAnswers(
      99999999,
      adminReviewerContext(NON_EVALUATOR_ACCOUNT_ID),
    );
    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((result as { code: number }).code).toBe(404);
  });
});

// ─── Story 002 / FR-8 — guard isolation ──────────────────────────────────────
// FLAGGED (not asserted here): the 403-for-non-DOED / 401-for-anonymous behaviour of
// `/admins/covers/*` is enforced by the SHARED `adminGuard` (= requireRoles(Role.DOED)),
// the same middleware already protecting other admin routes (e.g. the admin score
// endpoint). Its HTTP short-circuit depends on the elysia-autoload scope-composition
// pipeline and could not be reproduced in an isolated unit mount (the route 404s without
// the full autoload config; requireRoles' `as:"local"` early-return does not propagate in
// a bare `.use().get()` mount). The admin route file wires `adminGuard` identically to the
// evaluator routes' `evalGuard`; verify the 403/401 paths via e2e or manual check.
