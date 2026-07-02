import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { Value } from "@sinclair/typebox/value";
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
import { FinalizeSchema, VerdictSaveBodySchema } from "../schema/evaluator-review";
import { createEvaluatorReviewService } from "./evaluator-review";

// ─── Test DB ─────────────────────────────────────────────────────────────────
// Integration tests for bolt 019 (per-Answer verdict save). Covers stories
// 001 (schema shape), 002 (saveAnswerVerdict), 003 (authorship-keyed edit guard).

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const reviewService = createEvaluatorReviewService(db);

// ─── Fixture constants ───────────────────────────────────────────────────────

const TEST_FACTORY_ACCOUNT_ID = 99953; // distinct from other integration tests
const TEST_PROVINCE_ID = 10; // seeded province in health region 13
const COVER_REGION = 13; // = provinces(10).health_region
const WRONG_REGION = 1; // a region the cover does NOT belong to
const SEEDED_ODPC_ID = 78; // seeded ODPC evaluator (for enroll FKs)

// Synthetic reviewer accountIds (saveAnswerVerdict trusts the passed context,
// so these need not exist in Evaluators).
const MENTAL_A = 60001;
const MENTAL_B = 60002; // a *different* Mental author (non-author case)
const DOH_A = 60003;
const ODPC_A = 60004;

const mentalCtx = (id: number) => ({
  accountId: id,
  level: "Mental" as const,
  region: COVER_REGION,
});
const dohCtx = (id: number) => ({ accountId: id, level: "DOH" as const, region: COVER_REGION });
const odpcCtx = (id: number) => ({ accountId: id, level: "ODPC" as const, region: COVER_REGION });

const CATEGORY_QUESTION: Record<string, number> = {
  Collaborate: 1,
  Disease: 12,
  Safety: 23,
  Mental: 36,
  Outcome: 38,
};
const ALL_CATEGORIES = Object.keys(CATEGORY_QUESTION);

let coverId: number;
const answerByCat: Record<string, number> = {};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Append a log so it becomes the answer's current state (latest id wins). */
async function baseline(
  answerId: number,
  s: "in_review" | "recommended" | "rejected" | "finished",
  evalId?: number,
) {
  await db.insert(answerLogs).values({ answerId, status: s, eval_id: evalId ?? null });
}

async function latestStatusOf(answerId: number) {
  const row = await db
    .select({ status: answerLogs.status, evalId: answerLogs.eval_id })
    .from(answerLogs)
    .where(eq(answerLogs.answerId, answerId))
    .orderBy(desc(answerLogs.id))
    .limit(1)
    .then((r) => r[0]);
  return row;
}

async function coverLogCount() {
  return db
    .select({ id: coverLogs.id })
    .from(coverLogs)
    .where(eq(coverLogs.coverId, coverId))
    .then((r) => r.length);
}

const code = (r: unknown) => (r as { code: number }).code;
const body = (r: unknown) => (r as { response: Record<string, unknown> }).response;

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
    username: "test_factory_save",
    password: "hashed",
    email: "test_factory_save@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: TEST_FACTORY_ACCOUNT_ID,
    factoryType: 1,
    nameTh: "โรงงานทดสอบเซฟ",
    nameEn: "Test Save Factory",
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
    })
    .returning();

  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  coverId = cover.id;

  for (const cat of ALL_CATEGORIES) {
    const [ans] = await db
      .insert(answers)
      .values({ questionId: CATEGORY_QUESTION[cat], coverId, selectedChoice: "2" })
      .returning();
    answerByCat[cat] = ans.id;
    await db.insert(answerLogs).values({ answerId: ans.id, status: "in_review" });
  }
});

afterAll(async () => {
  await cleanupFactory();
  await emailQueue.close();
  await pool.end();
});

// ─── Story 001 — save-body & finalize schema shape ───────────────────────────

describe("Story 001 — VerdictSaveBodySchema / FinalizeSchema", () => {
  it("AC: approve body needs neither verdictChoice nor description", () => {
    expect(Value.Check(VerdictSaveBodySchema, { decision: "approve" })).toBe(true);
  });

  it("AC: change_score requires verdictChoice (0–3) + description", () => {
    expect(
      Value.Check(VerdictSaveBodySchema, {
        decision: "change_score",
        verdictChoice: "1",
        description: "x",
      }),
    ).toBe(true);
    expect(
      Value.Check(VerdictSaveBodySchema, { decision: "change_score", verdictChoice: "1" }),
    ).toBe(false);
    expect(
      Value.Check(VerdictSaveBodySchema, {
        decision: "change_score",
        verdictChoice: "5",
        description: "x",
      }),
    ).toBe(false);
  });

  it("AC: reject requires description", () => {
    expect(Value.Check(VerdictSaveBodySchema, { decision: "reject", description: "bad" })).toBe(
      true,
    );
    expect(Value.Check(VerdictSaveBodySchema, { decision: "reject" })).toBe(false);
  });

  it("AC: answerId is NOT required by the save body (it is a path param)", () => {
    // The body carries no answerId — a bare decision is a complete, valid body.
    expect(Value.Check(VerdictSaveBodySchema, { decision: "approve" })).toBe(true);
  });

  it("AC: FinalizeSchema accepts an empty object", () => {
    expect(Value.Check(FinalizeSchema, {})).toBe(true);
  });
});

// ─── Story 002 — saveAnswerVerdict outcomes & guards ─────────────────────────

describe("Story 002 — saveAnswerVerdict", () => {
  it("AC: tier-1 (Mental) approve → recommended", async () => {
    await baseline(answerByCat.Mental, "in_review");
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Mental,
      mentalCtx(MENTAL_A),
      {
        decision: "approve",
      },
    );
    expect(code(res)).toBe(200);
    expect(body(res).status).toBe("recommended");
    expect((await latestStatusOf(answerByCat.Mental))?.status).toBe("recommended");
  });

  it("AC: ODPC approve → recommended (NOT finished — only finalize writes finished)", async () => {
    await baseline(answerByCat.Collaborate, "in_review");
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Collaborate,
      odpcCtx(ODPC_A),
      { decision: "approve" },
    );
    expect(code(res)).toBe(200);
    expect(body(res).status).toBe("recommended");
    expect((await latestStatusOf(answerByCat.Collaborate))?.status).toBe("recommended");
  });

  it("AC: change_score → rejected + verdict_choice + description", async () => {
    await baseline(answerByCat.Disease, "in_review");
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Disease,
      odpcCtx(ODPC_A),
      {
        decision: "change_score",
        verdictChoice: "1",
        description: "evidence supports 1",
      },
    );
    expect(code(res)).toBe(200);
    expect(body(res).status).toBe("rejected");
    const log = await db
      .select({ vc: answerLogs.verdictChoice, d: answerLogs.description })
      .from(answerLogs)
      .where(eq(answerLogs.answerId, answerByCat.Disease))
      .orderBy(desc(answerLogs.id))
      .limit(1)
      .then((r) => r[0]);
    expect(log.vc).toBe("1");
    expect(log.d).toBe("evidence supports 1");
  });

  it("AC: reject → rejected + null verdict_choice + description", async () => {
    await baseline(answerByCat.Safety, "in_review");
    const res = await reviewService.saveAnswerVerdict(coverId, answerByCat.Safety, dohCtx(DOH_A), {
      decision: "reject",
      description: "invalid evidence",
    });
    expect(code(res)).toBe(200);
    const log = await db
      .select({ vc: answerLogs.verdictChoice })
      .from(answerLogs)
      .where(eq(answerLogs.answerId, answerByCat.Safety))
      .orderBy(desc(answerLogs.id))
      .limit(1)
      .then((r) => r[0]);
    expect(log.vc).toBeNull();
  });

  it("AC: no-op change_score (== live choice '2') → 400", async () => {
    await baseline(answerByCat.Disease, "in_review");
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Disease,
      odpcCtx(ODPC_A),
      {
        decision: "change_score",
        verdictChoice: "2",
        description: "same as live",
      },
    );
    expect(code(res)).toBe(400);
  });

  it("AC: out-of-scope category (Mental acting on Disease) → 403", async () => {
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Disease,
      mentalCtx(MENTAL_A),
      {
        decision: "approve",
      },
    );
    expect(code(res)).toBe(403);
  });

  it("AC: answer not in this cover → 400", async () => {
    const res = await reviewService.saveAnswerVerdict(coverId, 99999999, odpcCtx(ODPC_A), {
      decision: "approve",
    });
    expect(code(res)).toBe(400);
  });

  it("AC: cover not accessible (wrong region) → 404", async () => {
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Mental,
      { accountId: MENTAL_A, level: "Mental", region: WRONG_REGION },
      { decision: "approve" },
    );
    expect(code(res)).toBe(404);
  });

  it("AC: save has no side effects — no coverLogs transition, no email enqueued", async () => {
    const addSpy = spyOn(emailQueue, "add");
    const before = await coverLogCount();
    await baseline(answerByCat.Outcome, "in_review");
    await reviewService.saveAnswerVerdict(coverId, answerByCat.Outcome, odpcCtx(ODPC_A), {
      decision: "approve",
    });
    expect(await coverLogCount()).toBe(before); // no cover transition written
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });
});

// ─── Story 003 — authorship-keyed edit guard ─────────────────────────────────

describe("Story 003 — authorship-keyed edit guard", () => {
  it("AC: finished is immutable to everyone (incl. ODPC) → 400", async () => {
    await baseline(answerByCat.Outcome, "finished", ODPC_A);
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Outcome,
      odpcCtx(ODPC_A),
      {
        decision: "approve",
      },
    );
    expect(code(res)).toBe(400);
  });

  it("AC: a tier-1 may re-edit its OWN recommended (while in_review)", async () => {
    await baseline(answerByCat.Mental, "recommended", MENTAL_A);
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Mental,
      mentalCtx(MENTAL_A),
      {
        decision: "reject",
        description: "changed my mind",
      },
    );
    expect(code(res)).toBe(200);
    expect(body(res).status).toBe("rejected");
  });

  it("AC: a DIFFERENT non-ODPC author cannot edit someone else's recommended → 403", async () => {
    await baseline(answerByCat.Mental, "recommended", MENTAL_A);
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Mental,
      mentalCtx(MENTAL_B),
      {
        decision: "approve",
      },
    );
    expect(code(res)).toBe(403);
  });

  it("AC: ODPC may override any recommended (author or not)", async () => {
    await baseline(answerByCat.Mental, "recommended", MENTAL_A);
    const res = await reviewService.saveAnswerVerdict(
      coverId,
      answerByCat.Mental,
      odpcCtx(ODPC_A),
      {
        decision: "change_score",
        verdictChoice: "3",
        description: "odpc override",
      },
    );
    expect(code(res)).toBe(200);
    expect(body(res).status).toBe("rejected");
  });

  it("AC: a rejected answer is re-editable by a scoped reviewer", async () => {
    await baseline(answerByCat.Safety, "rejected", DOH_A);
    const res = await reviewService.saveAnswerVerdict(coverId, answerByCat.Safety, dohCtx(DOH_A), {
      decision: "approve",
    });
    expect(code(res)).toBe(200);
    expect(body(res).status).toBe("recommended");
  });
});
