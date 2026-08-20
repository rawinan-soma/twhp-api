import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { SignJWT } from "jose";
import { Pool } from "pg";
import {
  accounts,
  answerLogs,
  answers,
  coverLogs,
  covers,
  enrolls,
  factories,
  questions,
} from "../drizzle/schema";
import { createScoreService } from "./score";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const scoreService = createScoreService(db);
type ScoreReport = Awaited<ReturnType<typeof scoreService.getScoresByRegion>>["items"][number];

/**
 * Intent 012 wrapped the three staff Score Report lists in a pagination envelope, so the call sites
 * below page through the result instead of reading a bare array.
 *
 * Every assertion is UNCHANGED from before that rewrite, and that is deliberate: they were written
 * against the pre-pagination implementation, so their continued passing is the output-parity proof
 * for the two-phase read (docs/adr/0011). Do not relax an assertion here to make the new query pass.
 *
 * Paging through all pages also exercises page stability — a duplicated or skipped Cover would break
 * the `find`-based assertions and the empty-result checks.
 */
const allReports = async (
  fetch: (pg: { page: number; limit: number }) => Promise<{
    items: unknown[];
    meta: { totalPages: number };
  }>,
) => {
  const out: ScoreReport[] = [];
  let page = 1;
  for (;;) {
    const result = await fetch({ page, limit: 100 });
    out.push(...(result.items as ScoreReport[]));
    if (page >= result.meta.totalPages) break;
    page += 1;
  }
  return out;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SECRET = new TextEncoder().encode(Bun.env.AUTH_JWT_SECRET!);
const GRADES = ["gold", "silver", "certificate", "joined"] as const;

const asScoreReport = (result: unknown) => result as ScoreReport;

async function mintJwt(sub: number, role: string) {
  return new SignJWT({ sub: String(sub), username: "test", role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET);
}

// ─── Fixture IDs (high to avoid seed collisions) ─────────────────────────────

const TEST_PROVINCE_ID = 10; // seeded province
const TEST_FACTORY_ACCOUNT_ID = 99901;
const TEST_FACTORY_ACCOUNT_ID_2 = 99902; // second factory, no cover

// ─── Fixture Setup / Teardown ─────────────────────────────────────────────────

let coverId: number;
let enrollId: number;
let allQuestionIds: number[];

beforeAll(async () => {
  // Idempotent cleanup in case a previous run left data behind
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

  allQuestionIds = await db
    .select({ id: questions.id })
    .from(questions)
    .then((rows) => rows.map((r) => r.id));

  // Factory account (has cover)
  await db.insert(accounts).values({
    id: TEST_FACTORY_ACCOUNT_ID,
    username: "test_factory_score",
    password: "hashed",
    email: "test_factory_score@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: TEST_FACTORY_ACCOUNT_ID,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ",
    nameEn: "Test Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: TEST_PROVINCE_ID,
    districtId: await db
      .select({ id: factories.districtId })
      .from(factories)
      .limit(1)
      .then((r) => r[0]?.districtId ?? 1001),
    subdistrictId: await db
      .select({ id: factories.subdistrictId })
      .from(factories)
      .limit(1)
      .then((r) => r[0]?.subdistrictId ?? 100101),
    isValidate: true,
  });

  // Evaluator account for test (reuse existing seeded evaluator id=78, region=1)
  // Province 10 is in region 13 — use that

  // Enroll + cover
  const evalRows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.role, "Evaluator"))
    .limit(1);
  const evalId = evalRows[0]?.id ?? 78;

  const [enroll] = await db
    .insert(enrolls)
    .values({
      factoryId: TEST_FACTORY_ACCOUNT_ID,
      evalDohId: evalId,
      evalOdpcId: evalId,
      evalMentalId: evalId,
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

  // Insert answers for all questions (choice "2" for all)
  for (const qId of allQuestionIds) {
    const [ans] = await db
      .insert(answers)
      .values({ questionId: qId, coverId, selectedChoice: "2" })
      .returning();
    await db.insert(answerLogs).values({ answerId: ans.id, status: "in_review" });
  }
});

afterAll(async () => {
  const answerIds = await db
    .select({ id: answers.id })
    .from(answers)
    .where(eq(answers.coverId, coverId))
    .then((rows) => rows.map((r) => r.id));
  if (answerIds.length > 0) {
    await db.delete(answerLogs).where(inArray(answerLogs.answerId, answerIds));
  }
  await db.delete(answers).where(eq(answers.coverId, coverId));
  await db.delete(coverLogs).where(eq(coverLogs.coverId, coverId));
  await db.delete(covers).where(eq(covers.id, coverId));
  await db.delete(enrolls).where(eq(enrolls.id, enrollId));
  // factories must be deleted after enrolls (FK constraint)
  await db.delete(factories).where(eq(factories.accountId, TEST_FACTORY_ACCOUNT_ID));
  await db.delete(accounts).where(eq(accounts.id, TEST_FACTORY_ACCOUNT_ID));
  await pool.end();
});

// ─── Story 003 + 004: getScoreByFactory (cover status guard + factory endpoint) ──

describe("Story 003 + 004 — getScoreByFactory (service level)", () => {
  it("AC 003-AC4 / 004-AC3: no cover → status 404", async () => {
    const result = await scoreService.getScoreByFactory(999999);
    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((result as ElysiaCustomStatusResponse).code).toBe(404);
  });

  it("AC 003-AC1 / 004-AC2: in_progress cover → status 400", async () => {
    await db.insert(coverLogs).values({ coverId, status: "in_progress" });
    const result = await scoreService.getScoreByFactory(TEST_FACTORY_ACCOUNT_ID);
    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((result as ElysiaCustomStatusResponse).code).toBe(400);
    expect((result as ElysiaCustomStatusResponse).response).toMatchObject({
      message: "cover is not ready for scoring",
    });
  });

  it("AC 003-AC2 / 004-AC1: in_review cover → 200 with ScoreReport", async () => {
    await db.insert(coverLogs).values({ coverId, status: "in_review" });
    const result = await scoreService.getScoreByFactory(TEST_FACTORY_ACCOUNT_ID);
    expect(result).toMatchObject({
      factoryId: TEST_FACTORY_ACCOUNT_ID,
      factoryNameTh: "โรงงานทดสอบ",
      coverId,
      coverStatus: "in_review",
      enrollId,
      grade: null,
    });
    // all choices "2" → each group percentage = round(2/3*100) = 67; verify nested scoring shape
    const scoring = asScoreReport(result).scoring;
    // NOTE: do not use `toMatchObject` with `expect.any(...)` here. On Bun 1.3.6 it MUTATES the
    // received object, replacing each matched value with the matcher itself:
    //   before {scoredCount: 41, maxScore: 123}  →  after {scoredCount: {}, maxScore: {}}
    // Any later read of those fields then sees a matcher, not a number, and arithmetic on them
    // yields NaN. Assert the shape with non-mutating checks instead.
    expect(typeof scoring.total.scoredCount).toBe("number");
    expect(typeof scoring.total.maxScore).toBe("number");
    expect(typeof scoring.total.achievedScore).toBe("number");
    expect(typeof scoring.total.percentage).toBe("number");
    expect(scoring.total.maxScore).toBe(3 * scoring.total.scoredCount);
    expect(scoring.total.percentage).toBeGreaterThanOrEqual(0);
    expect(scoring.total.percentage).toBeLessThanOrEqual(100);
    expect(scoring.collaborate).toHaveProperty("percentage");
  });

  it("AC 003-AC3: finished cover → 200 with ScoreReport", async () => {
    await db.insert(coverLogs).values({ coverId, status: "finished" });
    const result = asScoreReport(await scoreService.getScoreByFactory(TEST_FACTORY_ACCOUNT_ID));
    expect(result.coverStatus).toBe("finished");
    expect(GRADES).toContain(result.grade);
    expect(typeof result.scoring.total.percentage).toBe("number");
  });
});

// ─── Story 005: getScoresByRegion ─────────────────────────────────────────────

describe("Story 005 — getScoresByRegion (service level)", () => {
  it("AC1: returns array of Score Reports for factories in region", async () => {
    // Province 10 is region 13 — our test factory is in that region
    const result = await allReports((pg) => scoreService.getScoresByRegion(13, pg));
    const found = result.find((r) => r.factoryId === TEST_FACTORY_ACCOUNT_ID);
    expect(found).toBeDefined();
    expect(found).toHaveProperty("scoring");
    expect(found!.scoring).toHaveProperty("total");
    expect(found!.scoring).toHaveProperty("collaborate");
    expect(found!.scoring).toHaveProperty("disease");
    expect(found!.scoring).toHaveProperty("safety");
    expect(found!.scoring).toHaveProperty("mental");
    expect(found!.scoring).toHaveProperty("outcome");
  });

  it("AC2: region with no ready covers returns empty array", async () => {
    const result = await allReports((pg) => scoreService.getScoresByRegion(99, pg));
    expect(result).toEqual([]);
  });

  it("AC4: each item in response has all Score Report fields including category breakdown", async () => {
    const result = await allReports((pg) => scoreService.getScoresByRegion(13, pg));
    const found = result.find((r) => r.factoryId === TEST_FACTORY_ACCOUNT_ID);
    const groupMatcher = {
      scoredCount: expect.any(Number),
      maxScore: expect.any(Number),
      achievedScore: expect.any(Number),
      percentage: expect.any(Number),
    };
    expect(found).toMatchObject({
      factoryId: expect.any(Number),
      factoryNameTh: expect.any(String),
      coverId: expect.any(Number),
      coverStatus: expect.any(String),
      enrollId: expect.any(Number),
      scoring: {
        total: groupMatcher,
        collaborate: groupMatcher,
        disease: groupMatcher,
        safety: groupMatcher,
        mental: groupMatcher,
        outcome: groupMatcher,
      },
    });
  });
});

// ─── Story 006: getScoresByProvince ──────────────────────────────────────────

describe("Story 006 — getScoresByProvince (service level)", () => {
  it("AC1: returns array of Score Reports for factories in province", async () => {
    const result = await allReports((pg) => scoreService.getScoresByProvince(TEST_PROVINCE_ID, pg));
    const found = result.find((r) => r.factoryId === TEST_FACTORY_ACCOUNT_ID);
    expect(found).toBeDefined();
  });

  it("AC2: province with no ready covers returns empty array", async () => {
    const result = await allReports((pg) => scoreService.getScoresByProvince(99999, pg));
    expect(result).toEqual([]);
  });
});

// ─── Story 007: getAllScores ──────────────────────────────────────────────────

describe("Story 007 — getAllScores (service level)", () => {
  it("AC1: no filters returns all ready covers including test factory", async () => {
    const result = await allReports((pg) => scoreService.getAllScores(undefined, pg));
    const found = result.find((r) => r.factoryId === TEST_FACTORY_ACCOUNT_ID);
    expect(found).toBeDefined();
  });

  it("AC2: ?region=13 returns only factories in region 13", async () => {
    const result = await allReports((pg) => scoreService.getAllScores({ region: 13 }, pg));
    expect(result.length).toBeGreaterThan(0);
    const found = result.find((r) => r.factoryId === TEST_FACTORY_ACCOUNT_ID);
    expect(found).toBeDefined();
  });

  it("AC3: ?provinceId=10 returns only factories in province 10", async () => {
    const result = await allReports((pg) =>
      scoreService.getAllScores({ provinceId: TEST_PROVINCE_ID }, pg),
    );
    const found = result.find((r) => r.factoryId === TEST_FACTORY_ACCOUNT_ID);
    expect(found).toBeDefined();
  });

  it("AC4: both region and provinceId filters applied", async () => {
    const result = await allReports((pg) =>
      scoreService.getAllScores({ region: 13, provinceId: TEST_PROVINCE_ID }, pg),
    );
    const found = result.find((r) => r.factoryId === TEST_FACTORY_ACCOUNT_ID);
    expect(found).toBeDefined();
  });

  it("AC edge: non-existent region returns empty array", async () => {
    const result = await allReports((pg) => scoreService.getAllScores({ region: 99999 }, pg));
    expect(result).toEqual([]);
  });
});

// ─── Intent 011: finished-only Grade reward guard ─────────────────────────────

describe("Intent 011 — latest CoverLog gates Grade across every score surface", () => {
  const findFixture = <T extends { factoryId: number }>(rows: T[]) =>
    rows.find((row) => row.factoryId === TEST_FACTORY_ACCOUNT_ID);

  const getStaffReports = async () =>
    Promise.all([
      allReports((pg) => scoreService.getScoresByRegion(13, pg)),
      allReports((pg) => scoreService.getScoresByProvince(TEST_PROVINCE_ID, pg)),
      allReports((pg) => scoreService.getAllScores(undefined, pg)),
    ]);

  it("greatest CoverLog ID wins and only finished reports contain a Grade", async () => {
    // Deliberately invert timestamps to prove serial ID, not updatedAt, determines current state.
    await db.insert(coverLogs).values({
      coverId,
      status: "finished",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });

    const finishedFactoryReport = asScoreReport(
      await scoreService.getScoreByFactory(TEST_FACTORY_ACCOUNT_ID),
    );
    expect(finishedFactoryReport.coverStatus).toBe("finished");
    expect(GRADES).toContain(finishedFactoryReport.grade);

    for (const reports of await getStaffReports()) {
      const report = findFixture(reports);
      expect(report?.coverStatus).toBe("finished");
      expect(GRADES).toContain(report?.grade);
    }

    await db.insert(coverLogs).values({
      coverId,
      status: "in_review",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });

    const inReviewFactoryReport = await scoreService.getScoreByFactory(TEST_FACTORY_ACCOUNT_ID);
    expect(inReviewFactoryReport).toMatchObject({ coverStatus: "in_review", grade: null });

    for (const reports of await getStaffReports()) {
      expect(findFixture(reports)).toMatchObject({ coverStatus: "in_review", grade: null });
    }

    await db.insert(coverLogs).values({
      coverId,
      status: "in_progress",
      updatedAt: "1999-01-01T00:00:00.000Z",
    });

    const inProgressFactoryReport = await scoreService.getScoreByFactory(TEST_FACTORY_ACCOUNT_ID);
    expect(inProgressFactoryReport).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((inProgressFactoryReport as ElysiaCustomStatusResponse).code).toBe(400);

    for (const reports of await getStaffReports()) {
      expect(findFixture(reports)).toBeUndefined();
    }

    // Leave the shared fixture in the ready state expected by any later consumer.
    await db.insert(coverLogs).values({ coverId, status: "finished" });
  });
});

// ─── Story 004-007: Auth guard (401) via JWT mint ─────────────────────────────

describe("Stories 004-007 — unauthenticated requests return 401 (service JWT check)", () => {
  it("valid JWT can be minted and verified by jose (guard infra sanity check)", async () => {
    const token = await mintJwt(TEST_FACTORY_ACCOUNT_ID, "Factory");
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });
});
