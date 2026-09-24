// TEMPORARY (FY2026 extension, revert 2026-10-16)
// See .scratch/fiscal-year-extension-2026/issues/01-extend-fy2026-evaluation-period.md
import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { desc, eq, inArray } from "drizzle-orm";
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
import * as utils from "../utils";
import { createEnrollService } from "./enroll";
import { createEvaluationPeriod } from "./evaluationPeriod";
import { createEvaluatorReviewService } from "./evaluator-review";
import { createFactoryService } from "./factory";
import { createScoreService } from "./score";

// Captured before any spy so the mock can delegate to the real implementation.
const realUtilities = utils.utilities;

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);

// Every period uses the production value; only the clock moves.
const END = new Date(2026, 9, 16);
const BEFORE_ROLLOVER = createEvaluationPeriod(END, () => new Date(2026, 8, 24));
const EXTENSION_WINDOW = createEvaluationPeriod(END, () => new Date(2026, 9, 5));
const UNSET_IN_OCTOBER = createEvaluationPeriod(null, () => new Date(2026, 9, 5));

// ─── Fixture constants ───────────────────────────────────────────────────────

// Distinct from other integration tests. One factory per concern, because the factory-side
// score read takes the factory's first Cover.
const TEST_FACTORY_ACCOUNT_ID = 99961; // review: finalize + verdict save
const SCORE_FACTORY_ACCOUNT_ID = 99962; // factory score read: one finished Cover
const LIST_FACTORY_ACCOUNT_ID = 99963; // staff lists: enrolled 2026-06-01 (FY2026)
const TEST_PROVINCE_ID = 10; // seeded province in health region 13
const COVER_REGION = 13; // = provinces(10).health_region
const SEEDED_ODPC_ID = 78; // seeded ODPC evaluator (for enroll FKs)
const ODPC_A = 70101;

const odpcCtx = {
  accountId: ODPC_A,
  level: "ODPC" as const,
  scope: { kind: "region" as const, region: COVER_REGION },
};

const CATEGORY_QUESTION = {
  Collaborate: 1,
  Disease: 12,
  Safety: 23,
  Mental: 36,
  Outcome: 38,
} as const;

type AnswerSpec = {
  cat: keyof typeof CATEGORY_QUESTION;
  status: "in_review" | "recommended" | "rejected" | "finished";
  verdictChoice?: "0" | "1" | "2" | "3" | null;
  file?: string | null;
};

let enrollId: number;
let addSpy: ReturnType<typeof spyOn>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const code = (r: unknown) => (r as { code: number }).code;
const body = (r: unknown) => (r as { response: Record<string, unknown> }).response;

async function seedCover(specs: AnswerSpec[], onEnroll = enrollId) {
  const [cover] = await db.insert(covers).values({ enrollId: onEnroll }).returning();
  const answerIds: number[] = [];
  for (const s of specs) {
    const [ans] = await db
      .insert(answers)
      .values({
        questionId: CATEGORY_QUESTION[s.cat],
        coverId: cover.id,
        selectedChoice: "2",
        fileUrl1_1: s.file ?? null,
      })
      .returning();
    answerIds.push(ans.id);
    await db.insert(answerLogs).values({
      answerId: ans.id,
      status: s.status,
      verdictChoice: s.verdictChoice ?? null,
      description: s.status === "rejected" ? "needs work" : null,
      eval_id: s.status === "in_review" ? null : ODPC_A,
    });
  }
  return { coverId: cover.id, answerIds };
}

async function logsOf(answerId: number) {
  return db
    .select({ status: answerLogs.status })
    .from(answerLogs)
    .where(eq(answerLogs.answerId, answerId))
    .orderBy(desc(answerLogs.id));
}

async function coverLogsOf(coverId: number) {
  return db
    .select({ status: coverLogs.status })
    .from(coverLogs)
    .where(eq(coverLogs.coverId, coverId));
}

async function fileOf(answerId: number) {
  return db
    .select({ fileUrl1_1: answers.fileUrl1_1 })
    .from(answers)
    .where(eq(answers.id, answerId))
    .then((r) => r[0]?.fileUrl1_1 ?? null);
}

async function cleanupFactory(accountId: number) {
  const prevEnrolls = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, accountId));
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
  await db.delete(factories).where(eq(factories.accountId, accountId));
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

const ALL_FACTORIES = [TEST_FACTORY_ACCOUNT_ID, SCORE_FACTORY_ACCOUNT_ID, LIST_FACTORY_ACCOUNT_ID];

// ─── Fixture setup / teardown ────────────────────────────────────────────────

/** Account + validated Factory in province 10 + one Enrollment (dated now unless given). */
async function seedFactory(accountId: number, enrollDate?: string) {
  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);

  await db.insert(accounts).values({
    id: accountId,
    username: `test_factory_eval_period_${accountId}`,
    password: "hashed",
    email: `test_factory_eval_period_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบขยายเวลา",
    nameEn: "Test Evaluation Period Factory",
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
      factoryId: accountId,
      ...(enrollDate ? { enrollDate } : {}),
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
  return enroll.id;
}

beforeAll(async () => {
  for (const id of ALL_FACTORIES) await cleanupFactory(id);
  enrollId = await seedFactory(TEST_FACTORY_ACCOUNT_ID);

  // Stub the queue so finalize never enqueues to Redis.
  addSpy = spyOn(emailQueue, "add").mockResolvedValue({} as never);
});

beforeEach(() => {
  addSpy.mockClear();
});

afterAll(async () => {
  addSpy.mockRestore();
  for (const id of ALL_FACTORIES) await cleanupFactory(id);
  await emailQueue.close();
  await pool.end();
});

// ─── Results email ───────────────────────────────────────────────────────────

describe("Evaluation Period — results email withheld while open", () => {
  it("finalize to finished while open → 200 with Grade, but no verdict-result-finished job", async () => {
    const review = createEvaluatorReviewService(db, BEFORE_ROLLOVER);
    const { coverId } = await seedCover([{ cat: "Collaborate", status: "recommended" }]);

    const res = await review.finalize(coverId, odpcCtx);

    expect(code(res)).toBe(200);
    expect(body(res).coverStatus).toBe("finished");
    expect(typeof body(res).grade).toBe("string");
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("finalize to finished with the period unset → verdict-result-finished enqueued as today", async () => {
    const review = createEvaluatorReviewService(db, UNSET_IN_OCTOBER);
    const { coverId } = await seedCover([{ cat: "Collaborate", status: "recommended" }]);

    const res = await review.finalize(coverId, odpcCtx);

    expect(code(res)).toBe(200);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0][0]).toBe("verdict-result-finished");
  });

  it("finalize back to in_progress while open still enqueues verdict-result-in-progress", async () => {
    const review = createEvaluatorReviewService(db, BEFORE_ROLLOVER);
    const { coverId } = await seedCover([{ cat: "Disease", status: "rejected" }]);

    const res = await review.finalize(coverId, odpcCtx);

    expect(code(res)).toBe(200);
    expect(body(res).coverStatus).toBe("in_progress");
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0][0]).toBe("verdict-result-in-progress");
  });
});

// ─── Hard-reject block ───────────────────────────────────────────────────────

describe("Evaluation Period — hard rejects blocked in the extension window", () => {
  it("before the rollover a reject verdict saves as today", async () => {
    const review = createEvaluatorReviewService(db, BEFORE_ROLLOVER);
    const { coverId, answerIds } = await seedCover([{ cat: "Safety", status: "in_review" }]);

    const res = await review.saveAnswerVerdict(coverId, answerIds[0], odpcCtx, {
      decision: "reject",
      description: "missing evidence",
    });

    expect(code(res)).toBe(200);
    expect((await logsOf(answerIds[0]))[0].status).toBe("rejected");
  });

  it("in the window a reject verdict → 400 and no answer log is written", async () => {
    const review = createEvaluatorReviewService(db, EXTENSION_WINDOW);
    const { coverId, answerIds } = await seedCover([{ cat: "Safety", status: "in_review" }]);

    const res = await review.saveAnswerVerdict(coverId, answerIds[0], odpcCtx, {
      decision: "reject",
      description: "missing evidence",
    });

    expect(code(res)).toBe(400);
    expect(await logsOf(answerIds[0])).toHaveLength(1); // only the seeded in_review
  });

  it("in the window approve and change_score still save", async () => {
    const review = createEvaluatorReviewService(db, EXTENSION_WINDOW);
    const { coverId, answerIds } = await seedCover([
      { cat: "Collaborate", status: "in_review" },
      { cat: "Disease", status: "in_review" },
    ]);

    const approved = await review.saveAnswerVerdict(coverId, answerIds[0], odpcCtx, {
      decision: "approve",
    });
    const changed = await review.saveAnswerVerdict(coverId, answerIds[1], odpcCtx, {
      decision: "change_score",
      verdictChoice: "1",
      description: "partial evidence",
    });

    expect(code(approved)).toBe(200);
    expect(code(changed)).toBe(200);
  });

  it("in the window finalize with a hard-rejected Answer → 400 naming it, with no side effects", async () => {
    const deleteSpy = spyOn(utils, "utilities").mockImplementation(() => ({
      ...realUtilities(),
      deleteFileStrict: async () => {
        throw new Error("finalize must not delete files when blocked");
      },
    }));
    try {
      const review = createEvaluatorReviewService(db, EXTENSION_WINDOW);
      const { coverId, answerIds } = await seedCover([
        { cat: "Collaborate", status: "recommended" },
        { cat: "Mental", status: "rejected", file: "evidence.pdf" },
      ]);

      const res = await review.finalize(coverId, odpcCtx);

      expect(code(res)).toBe(400);
      expect(body(res).message).toContain(`answers ${answerIds[1]} as`);
      expect(await coverLogsOf(coverId)).toHaveLength(0);
      expect((await logsOf(answerIds[0]))[0].status).toBe("recommended");
      expect((await logsOf(answerIds[1]))[0].status).toBe("rejected");
      expect(await fileOf(answerIds[1])).toBe("evidence.pdf");
      expect(addSpy).not.toHaveBeenCalled();
    } finally {
      deleteSpy.mockRestore();
    }
  });

  it("in the window, once the reject is re-saved as a score change, finalize succeeds", async () => {
    const review = createEvaluatorReviewService(db, EXTENSION_WINDOW);
    const { coverId, answerIds } = await seedCover([{ cat: "Outcome", status: "rejected" }]);

    const resaved = await review.saveAnswerVerdict(coverId, answerIds[0], odpcCtx, {
      decision: "change_score",
      verdictChoice: "1",
      description: "scored down instead of rejected",
    });
    const res = await review.finalize(coverId, odpcCtx);

    expect(code(resaved)).toBe(200);
    expect(code(res)).toBe(200);
    expect(body(res).coverStatus).toBe("finished");
  });

  it("in the window a legacy score change (rejected WITH verdict_choice) is not a hard reject", async () => {
    const review = createEvaluatorReviewService(db, EXTENSION_WINDOW);
    const { coverId } = await seedCover([
      { cat: "Safety", status: "rejected", verdictChoice: "1" },
    ]);

    const res = await review.finalize(coverId, odpcCtx);

    expect(code(res)).toBe(200);
    expect(body(res).coverStatus).toBe("finished");
  });
});

// ─── Factory score read ──────────────────────────────────────────────────────

describe("Evaluation Period — factory score read hides the Grade while open", () => {
  beforeAll(async () => {
    const scoreEnrollId = await seedFactory(SCORE_FACTORY_ACCOUNT_ID);
    const { coverId } = await seedCover(
      [{ cat: "Collaborate", status: "finished" }],
      scoreEnrollId,
    );
    await db.insert(coverLogs).values({ coverId, status: "finished", evaluatorId: ODPC_A });
  });

  it("while open → grade null, scoring unchanged", async () => {
    const open = await createScoreService(db, BEFORE_ROLLOVER).getScoreByFactory(
      SCORE_FACTORY_ACCOUNT_ID,
    );
    const unset = await createScoreService(db, UNSET_IN_OCTOBER).getScoreByFactory(
      SCORE_FACTORY_ACCOUNT_ID,
    );

    expect((open as { coverStatus: string }).coverStatus).toBe("finished");
    expect((open as { grade: string | null }).grade).toBeNull();
    expect((unset as { grade: string | null }).grade).toEqual(expect.any(String));
    expect((open as { scoring: unknown }).scoring).toEqual((unset as { scoring: unknown }).scoring);
  });
});

// ─── Staff lists ─────────────────────────────────────────────────────────────

describe("Evaluation Period — staff lists keep FY2026 in the extension window", () => {
  const page = { page: 1, limit: 100 };

  beforeAll(async () => {
    const listEnrollId = await seedFactory(LIST_FACTORY_ACCOUNT_ID, "2026-06-01 10:00:00");
    const { coverId } = await seedCover([{ cat: "Disease", status: "finished" }], listEnrollId);
    await db.insert(coverLogs).values({ coverId, status: "finished", evaluatorId: ODPC_A });
  });

  const scoreFactoryIds = async (period: typeof EXTENSION_WINDOW) => {
    const res = await createScoreService(db, period).getScoresByProvince(TEST_PROVINCE_ID, page);
    return (res as { items: { factoryId: number; grade: string | null }[] }).items;
  };
  const enrollFactoryIds = async (period: typeof EXTENSION_WINDOW) => {
    const res = await createEnrollService(db, period).getAllEnrollsByProvince(
      TEST_PROVINCE_ID,
      undefined,
      page,
    );
    return (res as { items: { factoryId: number }[] }).items.map((i) => i.factoryId);
  };
  const listedFactoryIds = async (period: typeof EXTENSION_WINDOW) => {
    const res = await createFactoryService(db, period).getAllFactoriesByProvinceId({
      validated: true,
      enrolled: true,
      provinceId: TEST_PROVINCE_ID,
      ...page,
    });
    return (res as { items: { account_id: number }[] }).items.map((i) => i.account_id);
  };

  it("score list: FY2026 Cover listed with its Grade in the window, gone when unset", async () => {
    const inWindow = await scoreFactoryIds(EXTENSION_WINDOW);
    const row = inWindow.find((i) => i.factoryId === LIST_FACTORY_ACCOUNT_ID);
    expect(row?.grade).toEqual(expect.any(String));
    expect((await scoreFactoryIds(UNSET_IN_OCTOBER)).map((i) => i.factoryId)).not.toContain(
      LIST_FACTORY_ACCOUNT_ID,
    );
  });

  it("enroll list: FY2026 enrollment listed in the window, gone when unset", async () => {
    expect(await enrollFactoryIds(EXTENSION_WINDOW)).toContain(LIST_FACTORY_ACCOUNT_ID);
    expect(await enrollFactoryIds(UNSET_IN_OCTOBER)).not.toContain(LIST_FACTORY_ACCOUNT_ID);
  });

  it("factory list (enrolled=true): FY2026 enrollee listed in the window, gone when unset", async () => {
    expect(await listedFactoryIds(EXTENSION_WINDOW)).toContain(LIST_FACTORY_ACCOUNT_ID);
    expect(await listedFactoryIds(UNSET_IN_OCTOBER)).not.toContain(LIST_FACTORY_ACCOUNT_ID);
  });
});
