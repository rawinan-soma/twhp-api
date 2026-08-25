import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
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
import { createAnswerService } from "./answer";
import { createEvaluatorReviewService } from "./evaluator-review";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const answerService = createAnswerService(db);
const reviewService = createEvaluatorReviewService(db);

// ─── Fixture constants ───────────────────────────────────────────────────────

const FACTORY = 99981;
const NO_DATA_FACTORY = 99982; // never seeded → 404
const PROVINCE = 10;
const COVER_REGION = 13; // = provinces(10).health_region
const SEEDED_EVALUATOR_ID = 78;

// one seeded question id per scenario
const Q = { inReview: 1, changeScore: 12, hardReject: 23, finished: 36, settled: 38 };

let coverId: number;
const answerIdByQ: Record<number, number> = {};

const enrollValues = (factoryId: number) => ({
  factoryId,
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

/** Insert an answer + its answerLog history (latest log = latest verdict). */
async function seedAnswer(
  questionId: number,
  logs: {
    status: "in_review" | "rejected" | "recommended" | "finished";
    verdictChoice?: string | null;
    description?: string | null;
  }[],
) {
  const [ans] = await db
    .insert(answers)
    .values({ questionId, coverId, selectedChoice: "2" })
    .returning();
  answerIdByQ[questionId] = ans.id;
  for (const l of logs) {
    await db.insert(answerLogs).values({
      answerId: ans.id,
      status: l.status,
      verdictChoice: l.verdictChoice ?? null,
      description: l.description ?? null,
    });
  }
  return ans.id;
}

async function cleanupFactory(factoryId: number) {
  const prevEnrolls = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, factoryId));
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
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
}

beforeAll(async () => {
  await cleanupFactory(FACTORY);

  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);

  await db.insert(accounts).values({
    id: FACTORY,
    username: "test_factory_answer_verdict",
    password: "hashed",
    email: "test_factory_answer_verdict@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: FACTORY,
    factoryType: 1,
    nameTh: "โรงงานทดสอบคำตัดสิน",
    nameEn: "Test Answer Verdict Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: PROVINCE,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: true,
  });

  const [enroll] = await db.insert(enrolls).values(enrollValues(FACTORY)).returning();
  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  coverId = cover.id;

  // in_review: no evaluator action yet
  await seedAnswer(Q.inReview, [{ status: "in_review" }]);
  // change_score: evaluator proposed a new score (rejected + verdictChoice set), after an in_review log
  await seedAnswer(Q.changeScore, [
    { status: "in_review" },
    { status: "rejected", verdictChoice: "3", description: "ปรับเป็น 3" },
  ]);
  // hard reject: rejected + verdictChoice null
  await seedAnswer(Q.hardReject, [
    { status: "in_review" },
    { status: "rejected", verdictChoice: null, description: "เอกสารไม่ครบ" },
  ]);
  // finished
  await seedAnswer(Q.finished, [{ status: "in_review" }, { status: "finished" }]);
  // settled score change — the shape a change_score takes after this intent
  await seedAnswer(Q.settled, [
    { status: "in_review" },
    { status: "recommended", verdictChoice: "1", description: "หลักฐานรองรับระดับ 1" },
  ]);
});

afterAll(async () => {
  await cleanupFactory(FACTORY);
  await pool.end();
});

// ─── getAnswerByFactoryId — verdict enrichment ───────────────────────────────

describe("getAnswerByFactoryId — verdict enrichment", () => {
  type Row = {
    questionId: number;
    selectedChoice: string;
    status: string;
    verdictChoice: string | null;
    description: string | null;
    fileUrl1_1: string | null;
  };

  it("AC: surfaces latest status + verdictChoice + description per answer (latest-log-wins)", async () => {
    const rows = (await answerService.getAnswerByFactoryId(FACTORY)) as Row[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(5);
    const byQ = (qid: number) => rows.find((r) => r.questionId === qid)!;

    // in_review — no evaluator action
    expect(byQ(Q.inReview).status).toBe("in_review");
    expect(byQ(Q.inReview).verdictChoice).toBeNull();
    expect(byQ(Q.inReview).description).toBeNull();

    // change_score — rejected with a proposed score (latest wins over the earlier in_review log)
    expect(byQ(Q.changeScore).status).toBe("rejected");
    expect(byQ(Q.changeScore).verdictChoice).toBe("3");
    expect(byQ(Q.changeScore).description).toBe("ปรับเป็น 3");

    // hard reject — rejected with no proposed score
    expect(byQ(Q.hardReject).status).toBe("rejected");
    expect(byQ(Q.hardReject).verdictChoice).toBeNull();
    expect(byQ(Q.hardReject).description).toBe("เอกสารไม่ครบ");

    // finished
    expect(byQ(Q.finished).status).toBe("finished");
    expect(byQ(Q.finished).verdictChoice).toBeNull();
  });

  it("AC: existing answer fields are preserved (backward compatible)", async () => {
    const rows = (await answerService.getAnswerByFactoryId(FACTORY)) as Row[];
    const r = rows[0];
    expect(r.selectedChoice).toBe("2");
    expect(typeof r.questionId).toBe("number");
    expect("fileUrl1_1" in r).toBe(true);
  });

  it("AC: factory with no answers → 404", async () => {
    const res = await answerService.getAnswerByFactoryId(NO_DATA_FACTORY);
    expect(res).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((res as { code: number }).code).toBe(404);
  });
});

// ─── Negotiation retired for score changes ───────────────────────────────────

const code = (r: unknown) => (r as { code: number }).code;
const body = (r: unknown) => (r as { response: Record<string, unknown> }).response;

describe("negotiate — a settled score change admits no factory response", () => {
  const negotiate = (questionId: number, action: "accept" | "redo") =>
    answerService.negotiate(FACTORY, { questionId, action } as never);

  // negotiate is only open while the Cover sits with the factory.
  beforeAll(async () => {
    await db.insert(coverLogs).values({ coverId, status: "in_progress" });
  });

  it("AC: accept on a settled score change (recommended) → 400, final", async () => {
    const res = await negotiate(Q.settled, "accept");
    expect(code(res)).toBe(400);
    expect(String(body(res).message)).toContain("final");
  });

  it("AC: accept on a LEGACY score change (rejected + verdictChoice) → 400, final", async () => {
    // The pre-intent shape still in production. Before this run it succeeded and wrote a
    // second settled score behind finalize's back.
    const res = await negotiate(Q.changeScore, "accept");
    expect(code(res)).toBe(400);
    expect(String(body(res).message)).toContain("final");
  });

  it("AC: accept on a hard reject keeps its own message", async () => {
    const res = await negotiate(Q.hardReject, "accept");
    expect(code(res)).toBe(400);
    expect(String(body(res).message)).toContain("redo instead");
  });

  it("AC: redo on a settled score change is refused too", async () => {
    // `redo` is refused too — the correction is settled, so there is nothing to re-answer.
    const res = await negotiate(Q.settled, "redo");
    expect(code(res)).toBe(400);
    expect(String(body(res).message)).toContain("final");
  });
});

// ─── After finalize, the factory's own view carries the correction ───────────
//
// This is the notification channel: the finished email deliberately says nothing about
// corrected scores (run 008), so what the factory reads back IS the record.

describe("getAnswerByFactoryId — a settled correction after finalize", () => {
  type Row = {
    questionId: number;
    selectedChoice: string;
    status: string;
    verdictChoice: string | null;
    description: string | null;
  };

  beforeAll(async () => {
    // Resolve everything finalize would otherwise gate on: no in_review, no hard reject.
    await db.insert(answerLogs).values([
      { answerId: answerIdByQ[Q.inReview], status: "recommended" },
      { answerId: answerIdByQ[Q.hardReject], status: "recommended" },
    ]);

    const queueSpy = spyOn(emailQueue, "add").mockResolvedValue({} as never);
    const res = await reviewService.finalize(coverId, {
      accountId: SEEDED_EVALUATOR_ID,
      level: "ODPC",
      region: COVER_REGION,
    });
    queueSpy.mockRestore();
    expect((res as { code: number }).code).toBe(200);
  });

  it("AC: a corrected answer reads back as finished, with the settled score and the reason", async () => {
    const rows = (await answerService.getAnswerByFactoryId(FACTORY)) as Row[];
    const settled = rows.find((r) => r.questionId === Q.settled)!;

    expect(settled.status).toBe("finished");
    expect(settled.verdictChoice).toBe("1"); // marks it corrected, not self-reported
    expect(settled.description).toBe("หลักฐานรองรับระดับ 1"); // the evaluator's reason survives
    expect(settled.selectedChoice).toBe("1"); // the settled score is now the live choice
  });

  it("AC: an untouched approve is distinguishable from a correction", async () => {
    const rows = (await answerService.getAnswerByFactoryId(FACTORY)) as Row[];
    const approved = rows.find((r) => r.questionId === Q.inReview)!;

    expect(approved.status).toBe("finished");
    // No verdict choice — the factory's own answer stood. This is the flag the UI keys off.
    expect(approved.verdictChoice).toBeNull();
    expect(approved.selectedChoice).toBe("2");
  });
});
