import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { desc, eq, inArray } from "drizzle-orm";
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
import type { VerdictBatch } from "../schema/evaluator-review";
import { adminReviewerContext, createEvaluatorReviewService } from "./evaluator-review";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const reviewService = createEvaluatorReviewService(db);

// Intercept the BullMQ enqueue so tests don't push real jobs to Redis,
// and so we can assert verdict-result email parity.
const emailAdd = spyOn(emailQueue, "add").mockResolvedValue(undefined as never);

// ─── Fixture constants ───────────────────────────────────────────────────────

const TEST_FACTORY_ACCOUNT_ID = 99961;
const TEST_PROVINCE_ID = 10; // health region 13 → proves national (region-null) finalize
const ADMIN_ID = 99962; // DOED admin acting as national ODPC
const SEEDED_EVALUATOR_ID = 78;
const CATEGORY_QUESTION: Record<string, number> = {
  Collaborate: 1,
  Disease: 12,
  Safety: 23,
  Mental: 36,
  Outcome: 38,
};
const ALL_CATEGORIES = Object.keys(CATEGORY_QUESTION);

const ENROLL_BASE = {
  factoryId: TEST_FACTORY_ACCOUNT_ID,
  evalDohId: SEEDED_EVALUATOR_ID,
  evalOdpcId: SEEDED_EVALUATOR_ID,
  evalMentalId: SEEDED_EVALUATOR_ID,
  safetyOfficerEmail: "test_admin_verdict@test.com",
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
};

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

/** Insert a fresh in_review cover with one answer per category. */
async function seedCover() {
  const [enroll] = await db.insert(enrolls).values(ENROLL_BASE).returning();
  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  const answerByCat: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) {
    const [ans] = await db
      .insert(answers)
      .values({ questionId: CATEGORY_QUESTION[cat], coverId: cover.id, selectedChoice: "2" })
      .returning();
    await db.insert(answerLogs).values({ answerId: ans.id, status: "in_review" });
    answerByCat[cat] = ans.id;
  }
  return { coverId: cover.id, answerByCat };
}

const latestCoverLog = (coverId: number) =>
  db
    .select({ status: coverLogs.status, evaluatorId: coverLogs.evaluatorId })
    .from(coverLogs)
    .where(eq(coverLogs.coverId, coverId))
    .orderBy(desc(coverLogs.id))
    .limit(1)
    .then((r) => r[0]);

const latestAnswerLog = (answerId: number) =>
  db
    .select({ status: answerLogs.status, evalId: answerLogs.eval_id })
    .from(answerLogs)
    .where(eq(answerLogs.answerId, answerId))
    .orderBy(desc(answerLogs.id))
    .limit(1)
    .then((r) => r[0]);

beforeAll(async () => {
  await cleanupFactory();
  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);
  await db.insert(accounts).values({
    id: TEST_FACTORY_ACCOUNT_ID,
    username: "test_factory_admin_verdict",
    password: "hashed",
    email: "test_factory_admin_verdict@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: TEST_FACTORY_ACCOUNT_ID,
    factoryType: 1,
    nameTh: "โรงงานทดสอบคำตัดสิน",
    nameEn: "Test Admin Verdict Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: TEST_PROVINCE_ID,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: true,
  });
});

beforeEach(() => {
  emailAdd.mockClear();
});

afterAll(async () => {
  await cleanupFactory();
  emailAdd.mockRestore();
  await pool.end();
});

// ─── Story 003 — admin verdict → ODPC finalize ───────────────────────────────

describe("Story 003 — admin verdict drives the ODPC finalize path", () => {
  it("AC: approve-all (national admin) → cover finished, audit = admin id, grade + email", async () => {
    const { coverId, answerByCat } = await seedCover();
    const batch = ALL_CATEGORIES.map((c) => ({
      answerId: answerByCat[c],
      decision: "approve" as const,
    })) as VerdictBatch;

    const res = await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), batch);
    expect(res).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((res as { code: number }).code).toBe(200);
    // grade computed on finalize (all "2" → 67% overall → "certificate")
    expect((res as unknown as { response: { grade: unknown } }).response.grade).toBe("certificate");

    // cover transition + audit identity
    const cl = await latestCoverLog(coverId);
    expect(cl).toMatchObject({ status: "finished", evaluatorId: ADMIN_ID });

    // every answer finished, audited as the admin
    for (const c of ALL_CATEGORIES) {
      const al = await latestAnswerLog(answerByCat[c]);
      expect(al).toMatchObject({ status: "finished", evalId: ADMIN_ID });
    }

    // verdict-result-finished email enqueued with the grade
    expect(emailAdd).toHaveBeenCalledTimes(1);
    expect(emailAdd.mock.calls[0][0]).toBe("verdict-result-finished");
    expect((emailAdd.mock.calls[0][1] as { grade: unknown }).grade).toBe("certificate");
  });

  it("AC: any reject → cover in_progress, grade null, in-progress email, audit = admin id", async () => {
    const { coverId, answerByCat } = await seedCover();
    const batch = ALL_CATEGORIES.map((c, i) =>
      i === 0
        ? { answerId: answerByCat[c], decision: "reject" as const, description: "ไม่ผ่าน" }
        : { answerId: answerByCat[c], decision: "approve" as const },
    ) as VerdictBatch;

    const res = await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), batch);
    expect((res as { code: number }).code).toBe(200);
    expect((res as unknown as { response: { grade: unknown } }).response.grade).toBeNull();

    const cl = await latestCoverLog(coverId);
    expect(cl).toMatchObject({ status: "in_progress", evaluatorId: ADMIN_ID });

    expect(emailAdd).toHaveBeenCalledTimes(1);
    expect(emailAdd.mock.calls[0][0]).toBe("verdict-result-in-progress");
  });

  it("AC: change_score to the factory's current choice (no-op) → 400, no transition", async () => {
    const { coverId, answerByCat } = await seedCover();
    // every seeded answer is selectedChoice "2"; a change_score to "2" changes nothing
    const batch = [
      {
        answerId: answerByCat.Mental,
        decision: "change_score" as const,
        verdictChoice: "2" as const,
        description: "คะแนนเท่าเดิม",
      },
    ] as VerdictBatch;

    const res = await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), batch);
    expect((res as { code: number }).code).toBe(400);
    expect((res as { response: { message: string } }).response.message).toContain(
      "must differ from the current choice",
    );
    // guard runs before any write — no cover transition, no email
    const cl = await latestCoverLog(coverId);
    expect(cl).toBeUndefined();
    expect(emailAdd).not.toHaveBeenCalled();
  });

  it("AC: change_score to a different choice is still accepted (guard does not over-block)", async () => {
    const { coverId, answerByCat } = await seedCover();
    const batch = ALL_CATEGORIES.map((c, i) =>
      i === 0
        ? {
            answerId: answerByCat[c],
            decision: "change_score" as const,
            verdictChoice: "1" as const,
            description: "ปรับลดคะแนน",
          }
        : { answerId: answerByCat[c], decision: "approve" as const },
    ) as VerdictBatch;

    const res = await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), batch);
    expect((res as { code: number }).code).toBe(200);
    const cl = await latestCoverLog(coverId);
    expect(cl).toMatchObject({ status: "in_progress", evaluatorId: ADMIN_ID });
  });

  it("AC: finalize gate — leaving an answer in_review → 400, no transition", async () => {
    const { coverId, answerByCat } = await seedCover();
    // approve only 4 of 5; one stays in_review
    const batch = ALL_CATEGORIES.slice(0, 4).map((c) => ({
      answerId: answerByCat[c],
      decision: "approve" as const,
    })) as VerdictBatch;

    const res = await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), batch);
    expect((res as { code: number }).code).toBe(400);
    expect((res as { response: { message: string } }).response.message).toContain(
      "finalization blocked",
    );
    // no cover transition written
    const cl = await latestCoverLog(coverId);
    expect(cl).toBeUndefined();
    expect(emailAdd).not.toHaveBeenCalled();
  });

  it("AC: exact ODPC parity — a finished answer is immutable to the admin → 400", async () => {
    const { coverId, answerByCat } = await seedCover();
    const approveAll = ALL_CATEGORIES.map((c) => ({
      answerId: answerByCat[c],
      decision: "approve" as const,
    })) as VerdictBatch;
    await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), approveAll); // → finished

    const retry = [{ answerId: answerByCat.Mental, decision: "approve" as const }] as VerdictBatch;
    const res = await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), retry);
    expect((res as { code: number }).code).toBe(400);
    expect((res as { response: { message: string } }).response.message).toContain(
      "already finalized",
    );
  });

  it("AC: duplicate answerId in batch → 400", async () => {
    const { coverId, answerByCat } = await seedCover();
    const batch = [
      { answerId: answerByCat.Mental, decision: "approve" as const },
      { answerId: answerByCat.Mental, decision: "approve" as const },
    ] as VerdictBatch;
    const res = await reviewService.verdict(coverId, adminReviewerContext(ADMIN_ID), batch);
    expect((res as { code: number }).code).toBe(400);
  });

  it("AC: non-existent cover → 404 (admin, region null)", async () => {
    const batch = [{ answerId: 1, decision: "approve" as const }] as VerdictBatch;
    const res = await reviewService.verdict(99999999, adminReviewerContext(ADMIN_ID), batch);
    expect((res as { code: number }).code).toBe(404);
  });
});
