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
import { createEvaluatorReviewService } from "./evaluator-review";

// Captured before any spy so mocks can delegate to the real implementation.
const realUtilities = utils.utilities;

/**
 * Stub `utilities().deleteFileStrict` for a single finalize call (keeps every other
 * utility real), making the suite independent of MinIO reachability.
 */
function mockDeleteStrict(impl: (fileName: string | null) => Promise<void>) {
  return spyOn(utils, "utilities").mockImplementation(() => ({
    ...realUtilities(),
    deleteFileStrict: impl,
  }));
}

// ─── Test DB ─────────────────────────────────────────────────────────────────
// Integration tests for bolt 020 (ODPC finalize — story 004-odpc-finalize-action).
// Every case derives from a story-004 acceptance criterion; test names reference the
// AC they cover. No test asserts a code path absent from a story-004 AC.

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const reviewService = createEvaluatorReviewService(db);

// ─── Fixture constants ───────────────────────────────────────────────────────

const TEST_FACTORY_ACCOUNT_ID = 99955; // distinct from other integration tests
const TEST_PROVINCE_ID = 10; // seeded province in health region 13
const COVER_REGION = 13; // = provinces(10).health_region
const SEEDED_ODPC_ID = 78; // seeded ODPC evaluator (for enroll FKs)

// Synthetic reviewer accountIds (finalize trusts the passed context).
const MENTAL_A = 70001;
const DOH_A = 70002;
const ODPC_A = 70003; // finalizer
const FACTORY_ACCEPT_AUTHOR = 70004; // author of a "factory-accepted" recommended log

const mentalCtx = (id: number) => ({
  accountId: id,
  level: "Mental" as const,
  region: COVER_REGION,
});
const dohCtx = (id: number) => ({ accountId: id, level: "DOH" as const, region: COVER_REGION });
const odpcCtx = (id: number) => ({ accountId: id, level: "ODPC" as const, region: COVER_REGION });
const adminCtx = (id: number) => ({ accountId: id, level: "ODPC" as const, region: null });

const CATEGORY_QUESTION: Record<string, number> = {
  Collaborate: 1,
  Disease: 12,
  Safety: 23,
  Mental: 36,
  Outcome: 38,
};

type AnswerStatus = "in_review" | "recommended" | "rejected" | "finished";
type Choice = "0" | "1" | "2" | "3";

type AnswerSpec = {
  cat: keyof typeof CATEGORY_QUESTION;
  status: AnswerStatus;
  verdictChoice?: Choice | null;
  evalId?: number | null;
  file?: string | null; // seeded into fileUrl1_1
};

let enrollId: number;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const code = (r: unknown) => (r as { code: number }).code;
const body = (r: unknown) => (r as { response: Record<string, unknown> }).response;

/** Create a fresh cover under the fixture enroll with the given answers + latest logs. */
async function seedCover(specs: AnswerSpec[]) {
  const [cover] = await db.insert(covers).values({ enrollId }).returning();
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
      eval_id: s.evalId ?? null,
    });
  }
  return { coverId: cover.id, answerIds };
}

async function latestOf(answerId: number) {
  return db
    .select({
      status: answerLogs.status,
      verdictChoice: answerLogs.verdictChoice,
      evalId: answerLogs.eval_id,
    })
    .from(answerLogs)
    .where(eq(answerLogs.answerId, answerId))
    .orderBy(desc(answerLogs.id))
    .limit(1)
    .then((r) => r[0]);
}

async function coverLogsOf(coverId: number) {
  return db
    .select({ status: coverLogs.status, evaluatorId: coverLogs.evaluatorId })
    .from(coverLogs)
    .where(eq(coverLogs.coverId, coverId));
}

async function fileOf(answerId: number) {
  return db
    .select({ fileUrl1_1: answers.fileUrl1_1 })
    .from(answers)
    .where(eq(answers.id, answerId))
    .limit(1)
    .then((r) => r[0]?.fileUrl1_1 ?? null);
}

// Stub the queue so a real finalize never enqueues to Redis (the dev worker is live).
let addSpy: ReturnType<typeof spyOn>;

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

  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);

  await db.insert(accounts).values({
    id: TEST_FACTORY_ACCOUNT_ID,
    username: "test_factory_finalize",
    password: "hashed",
    email: "test_factory_finalize@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: TEST_FACTORY_ACCOUNT_ID,
    factoryType: 1,
    nameTh: "โรงงานทดสอบไฟนอลไลซ์",
    nameEn: "Test Finalize Factory",
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
      safetyOfficerEmail: "safety_finalize@test.com",
    })
    .returning();
  enrollId = enroll.id;

  addSpy = spyOn(emailQueue, "add").mockResolvedValue({} as never);
});

beforeEach(() => {
  addSpy.mockClear();
});

afterAll(async () => {
  addSpy.mockRestore();
  await cleanupFactory();
  await emailQueue.close();
  await pool.end();
});

// ─── AC1 — finalize is ODPC/admin only ───────────────────────────────────────

describe("Story 004 — finalize authorization (AC: tier-1 → 403)", () => {
  it("AC: a tier-1 (Mental) caller → 403, no finalize side effects", async () => {
    const { coverId } = await seedCover([
      { cat: "Mental", status: "recommended", evalId: MENTAL_A },
    ]);
    const res = await reviewService.finalize(coverId, mentalCtx(MENTAL_A));
    expect(code(res)).toBe(403);
    expect(await coverLogsOf(coverId)).toHaveLength(0);
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("AC: a tier-1 (DOH) caller → 403", async () => {
    const { coverId } = await seedCover([{ cat: "Disease", status: "recommended", evalId: DOH_A }]);
    const res = await reviewService.finalize(coverId, dohCtx(DOH_A));
    expect(code(res)).toBe(403);
  });

  it("AC: cover not accessible (wrong region for a regional ODPC) → 404", async () => {
    const { coverId } = await seedCover([{ cat: "Safety", status: "recommended", evalId: ODPC_A }]);
    const res = await reviewService.finalize(coverId, {
      accountId: ODPC_A,
      level: "ODPC",
      region: 1, // a region the cover does NOT belong to
    });
    expect(code(res)).toBe(404);
  });
});

// ─── AC3 — hard-gate on in_review ─────────────────────────────────────────────

describe("Story 004 — hard-gate on unresolved in_review (AC: any in_review → 400)", () => {
  it("AC: any Answer still in_review → 400, no invented verdict, no side effects", async () => {
    const { coverId, answerIds } = await seedCover([
      { cat: "Collaborate", status: "recommended", evalId: ODPC_A },
      { cat: "Disease", status: "in_review" }, // unresolved
    ]);
    const res = await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect(code(res)).toBe(400);
    // No promotion, no transition, no email.
    expect((await latestOf(answerIds[0])).status).toBe("recommended"); // not promoted
    expect((await latestOf(answerIds[1])).status).toBe("in_review"); // no invented verdict
    expect(await coverLogsOf(coverId)).toHaveLength(0);
    expect(addSpy).not.toHaveBeenCalled();
  });
});

// ─── AC4 — recommended → finished conversion ─────────────────────────────────

describe("Story 004 — recommended → finished (AC: un-overridden recommended converted)", () => {
  it("AC: tier-1 approvals, ODPC's own approvals, and factory-accepts all convert to finished (eval_id = finalizer)", async () => {
    const { coverId, answerIds } = await seedCover([
      { cat: "Collaborate", status: "recommended", evalId: MENTAL_A }, // tier-1 approval
      { cat: "Disease", status: "recommended", evalId: ODPC_A }, // ODPC's own approval
      { cat: "Safety", status: "recommended", evalId: FACTORY_ACCEPT_AUTHOR }, // factory-accept analogue
    ]);
    const res = await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect(code(res)).toBe(200);
    for (const id of answerIds) {
      const latest = await latestOf(id);
      expect(latest.status).toBe("finished");
      expect(latest.evalId).toBe(ODPC_A); // finalize authored the promotion
    }
  });

  it("AC: reads the persisted logs (no batch arg) — an already-finished answer stays finished, no duplicate promotion", async () => {
    const { coverId, answerIds } = await seedCover([
      { cat: "Collaborate", status: "recommended", evalId: MENTAL_A },
      { cat: "Disease", status: "finished", evalId: ODPC_A },
    ]);
    const res = await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect(code(res)).toBe(200);
    expect((await latestOf(answerIds[0])).status).toBe("finished");
    expect((await latestOf(answerIds[1])).status).toBe("finished");
  });
});

// ─── AC6 / AC8 — all finished → coverLog finished + Grade + one email ─────────

describe("Story 004 — finished outcome (AC: all finished → coverLog finished + Grade + email)", () => {
  it("AC: all recommended → one coverLog `finished` with evaluatorId + a computed Grade in the response", async () => {
    const { coverId } = await seedCover([
      { cat: "Collaborate", status: "recommended", evalId: ODPC_A },
      { cat: "Disease", status: "recommended", evalId: ODPC_A },
      { cat: "Safety", status: "recommended", evalId: ODPC_A },
    ]);
    const res = await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect(code(res)).toBe(200);

    const logs = await coverLogsOf(coverId);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("finished");
    expect(logs[0].evaluatorId).toBe(ODPC_A);

    expect(body(res).coverStatus).toBe("finished");
    expect(typeof body(res).grade).toBe("string"); // Grade computed on-demand
  });

  it("AC: exactly one factory email enqueued for the finished outcome (verdict-result-finished)", async () => {
    const { coverId } = await seedCover([
      { cat: "Outcome", status: "recommended", evalId: ODPC_A },
    ]);
    await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect(addSpy).toHaveBeenCalledTimes(1);
    const [jobName, payload] = addSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobName).toBe("verdict-result-finished");
    expect(payload.email).toBe("safety_finalize@test.com");
    expect(payload.factoryNameTh).toBe("โรงงานทดสอบไฟนอลไลซ์");
    expect(payload.grade).toBeDefined();
  });

  it("AC: a DOED admin (region null, existence-only access) may also finalize", async () => {
    const { coverId } = await seedCover([{ cat: "Mental", status: "recommended", evalId: ODPC_A }]);
    const res = await reviewService.finalize(coverId, adminCtx(9999));
    expect(code(res)).toBe(200);
    expect(body(res).coverStatus).toBe("finished");
  });
});

// ─── AC7 / AC8 — any rejected → coverLog in_progress, no Grade, one email ─────

describe("Story 004 — in_progress outcome (AC: ≥1 rejected → coverLog in_progress, no Grade)", () => {
  it("AC: ≥1 rejected → one coverLog `in_progress`, no Grade; recommended answers still promoted", async () => {
    const { coverId, answerIds } = await seedCover([
      { cat: "Collaborate", status: "recommended", evalId: ODPC_A },
      { cat: "Disease", status: "rejected", verdictChoice: null, evalId: ODPC_A }, // hard reject
    ]);
    const res = await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect(code(res)).toBe(200);

    const logs = await coverLogsOf(coverId);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("in_progress");

    expect(body(res).coverStatus).toBe("in_progress");
    expect(body(res).grade).toBeNull(); // no Grade on revision-needed

    // Settled answer still locks to finished; the rejected one stays rejected.
    expect((await latestOf(answerIds[0])).status).toBe("finished");
    expect((await latestOf(answerIds[1])).status).toBe("rejected");
  });

  it("AC: exactly one factory email enqueued for the in_progress outcome (verdict-result-in-progress)", async () => {
    const { coverId } = await seedCover([
      { cat: "Safety", status: "rejected", verdictChoice: null, evalId: ODPC_A },
    ]);
    await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect(addSpy).toHaveBeenCalledTimes(1);
    const [jobName, payload] = addSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobName).toBe("verdict-result-in-progress");
    expect(payload.email).toBe("safety_finalize@test.com");
    expect(payload.factoryNameTh).toBe("โรงงานทดสอบไฟนอลไลซ์");
    expect(payload.grade).toBeUndefined(); // no grade in the in_progress payload
  });
});

// ─── AC5 — deferred file deletion (hard-reject only) ─────────────────────────

describe("Story 004 — deferred file deletion (AC: hard-reject files deleted at finalize)", () => {
  it("AC: only final hard-reject (verdict_choice null) files are deleted; change-score & recommended files preserved", async () => {
    const { coverId, answerIds } = await seedCover([
      {
        cat: "Collaborate",
        status: "rejected",
        verdictChoice: null,
        evalId: ODPC_A,
        file: "hard-reject.pdf",
      },
      {
        cat: "Disease",
        status: "rejected",
        verdictChoice: "1",
        evalId: ODPC_A,
        file: "change-score.pdf",
      },
      { cat: "Safety", status: "recommended", evalId: ODPC_A, file: "recommended.pdf" },
    ]);

    const deleted: (string | null)[] = [];
    const utilSpy = mockDeleteStrict(async (fileName) => {
      deleted.push(fileName);
    });
    const res = await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    utilSpy.mockRestore();

    expect(code(res)).toBe(200);

    // Strict delete invoked for exactly the hard-reject file, and nothing else.
    expect(deleted).toEqual(["hard-reject.pdf"]);

    // …and the delete is recorded transactionally by nulling the file columns.
    expect(await fileOf(answerIds[0])).toBeNull(); // hard reject → deleted
    expect(await fileOf(answerIds[1])).toBe("change-score.pdf"); // score change → preserved
    expect(await fileOf(answerIds[2])).toBe("recommended.pdf"); // recommended → preserved
  });

  it("AC (edge case): a MinIO delete failure aborts finalize before the txn — no partial transition", async () => {
    const { coverId, answerIds } = await seedCover([
      { cat: "Collaborate", status: "recommended", evalId: ODPC_A },
      {
        cat: "Disease",
        status: "rejected",
        verdictChoice: null,
        evalId: ODPC_A,
        file: "will-fail.pdf",
      },
    ]);

    const utilSpy = mockDeleteStrict(async () => {
      throw new Error("MinIO unreachable");
    });
    const res = await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    utilSpy.mockRestore();

    expect(code(res)).toBe(500);
    // No partial transition: no coverLog, recommended NOT promoted, file NOT nulled, no email.
    expect(await coverLogsOf(coverId)).toHaveLength(0);
    expect((await latestOf(answerIds[0])).status).toBe("recommended");
    expect(await fileOf(answerIds[1])).toBe("will-fail.pdf");
    expect(addSpy).not.toHaveBeenCalled();
  });
});

// ─── AC9 / FR-5 — only finalize writes `finished` ────────────────────────────

describe("Story 004 — only finalize writes finished (AC/FR-5)", () => {
  it("AC: the save path (ODPC approve) writes `recommended`, never `finished`", async () => {
    const { coverId, answerIds } = await seedCover([{ cat: "Outcome", status: "in_review" }]);
    const saved = await reviewService.saveAnswerVerdict(coverId, answerIds[0], odpcCtx(ODPC_A), {
      decision: "approve",
    });
    expect(code(saved)).toBe(200);
    expect((await latestOf(answerIds[0])).status).toBe("recommended"); // NOT finished
    // Only the subsequent finalize promotes it to finished.
    await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    expect((await latestOf(answerIds[0])).status).toBe("finished");
  });

  it("AC: promotions + the coverLogs transition are committed together (atomic)", async () => {
    const { coverId, answerIds } = await seedCover([
      { cat: "Collaborate", status: "recommended", evalId: ODPC_A },
      { cat: "Disease", status: "recommended", evalId: ODPC_A },
    ]);
    await reviewService.finalize(coverId, odpcCtx(ODPC_A));
    // Both the promotion logs AND the single transition landed.
    expect((await latestOf(answerIds[0])).status).toBe("finished");
    expect((await latestOf(answerIds[1])).status).toBe("finished");
    expect(await coverLogsOf(coverId)).toHaveLength(1);
  });
});
