import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  answerLogs,
  answers,
  awards,
  coverLogs,
  covers,
  enrolls,
  factories,
} from "../drizzle/schema";
import { emailQueue } from "../queue/email";
import { utilities } from "../utils";
import { createAwardHistory } from "./awardHistory";
import { createEvaluatorReviewService } from "./evaluator-review";
import { createScoreService } from "./score";

// Ticket 01 — the Awards table. Written against PostgreSQL: run only against a disposable
// DATABASE_URL (see CLAUDE.md), never the ordinary local `twhp` database.

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const reviewService = createEvaluatorReviewService(db);
const scoreService = createScoreService(db);

// ─── Fixture constants ───────────────────────────────────────────────────────

// Distinct from every other integration test's fixture ids.
const F_FINISHED = 99961; // finalized in the current fiscal year
const F_PAST = 99962; // finalized from a past-year Cover
const F_REVIEW = 99963; // Cover left in_review
const F_A = 99964; // constraint fixtures
const F_B = 99965;
const F_C1 = 99966; // consec-gold fixtures — one factory per scenario, one award per fiscal year
const F_C2 = 99967;
const F_C3 = 99968;
const F_C4 = 99969;
const F_C5 = 99970;
const F_C6 = 99971;
const ALL_FACTORIES = [F_FINISHED, F_PAST, F_REVIEW, F_A, F_B, F_C1, F_C2, F_C3, F_C4, F_C5, F_C6];

const TEST_PROVINCE_ID = 10; // seeded province in health region 13
const COVER_REGION = 13;
const SEEDED_ODPC_ID = 78;
const ODPC_A = 70003;

const odpcCtx = {
  accountId: ODPC_A,
  level: "ODPC" as const,
  scope: { kind: "region" as const, region: COVER_REGION },
};

// One Question per category. Question 38 is `special == 2`, so a consec-gold Cover must score it "3"
// (a `special == 2` Answer gates only that tier, never plain gold).
const CATEGORY_QUESTION = [1, 12, 23, 36, 38];

const currentYear = utilities().getFiscalYear().fiscalYear;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const code = (r: unknown) => (r as { code: number }).code;

/** Drizzle builders are lazy thenables; `expect(...).rejects` needs a real Promise. */
const rejects = (query: PromiseLike<unknown>) => expect(Promise.resolve(query)).rejects.toThrow();

const enrollValues = (factoryId: number, enrollDate?: string) => ({
  factoryId,
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
  safetyOfficerEmail: "safety_awards@test.com",
});

async function cleanup() {
  await db.delete(awards).where(inArray(awards.factoryId, ALL_FACTORIES));
  const prevEnrolls = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(inArray(enrolls.factoryId, ALL_FACTORIES));
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
  await db.delete(factories).where(inArray(factories.accountId, ALL_FACTORIES));
  await db.delete(accounts).where(inArray(accounts.id, ALL_FACTORIES));
}

async function makeFactory(id: number) {
  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);
  await db.insert(accounts).values({
    id,
    username: `test_awards_${id}`,
    password: "hashed",
    email: `test_awards_${id}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: id,
    factoryType: 1,
    nameTh: `โรงงานทดสอบรางวัล ${id}`,
    nameEn: `Test Awards Factory ${id}`,
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: TEST_PROVINCE_ID,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: true,
  });
}

/** An enrolment plus one Cover whose five Answers are `recommended` at the given live choice. */
async function seedCover(
  factoryId: number,
  opts: { enrollDate?: string; choice: "0" | "1" | "2" | "3"; coverStatus?: "in_review" },
) {
  const [enroll] = await db
    .insert(enrolls)
    .values(enrollValues(factoryId, opts.enrollDate))
    .returning();
  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  for (const questionId of CATEGORY_QUESTION) {
    const [ans] = await db
      .insert(answers)
      .values({ questionId, coverId: cover.id, selectedChoice: opts.choice })
      .returning();
    await db.insert(answerLogs).values({
      answerId: ans.id,
      status: "recommended",
      verdictChoice: null,
      description: null,
      eval_id: ODPC_A,
    });
  }
  if (opts.coverStatus) {
    await db.insert(coverLogs).values({ coverId: cover.id, status: opts.coverStatus });
  }
  return { coverId: cover.id };
}

const awardsOf = (coverId: number) => db.select().from(awards).where(eq(awards.coverId, coverId));

const scoreOf = async (factoryId: number, fiscalYear: number) =>
  (await scoreService.getScoreByFactory(factoryId, fiscalYear)) as {
    coverStatus: string;
    grade: string | null;
  };

let addSpy: ReturnType<typeof spyOn>;

beforeAll(async () => {
  await cleanup();
  for (const id of ALL_FACTORIES) await makeFactory(id);
  addSpy = spyOn(emailQueue, "add").mockResolvedValue({} as never);
});

afterAll(async () => {
  addSpy.mockRestore();
  await cleanup();
  await emailQueue.close();
  await pool.end();
});

// ─── Schema constraints ──────────────────────────────────────────────────────

describe("Awards — schema constraints", () => {
  it("AC: a Buddhist Era year such as 2566 is rejected by the database", async () => {
    await rejects(db.insert(awards).values({ factoryId: F_A, fiscalYear: 2566, grade: "gold" }));
  });

  it("AC: one factory may not hold two awards in the same fiscal year", async () => {
    await db.insert(awards).values({ factoryId: F_A, fiscalYear: 2023, grade: "gold" });
    await rejects(db.insert(awards).values({ factoryId: F_A, fiscalYear: 2023, grade: "silver" }));
  });

  it("AC: two factories may hold awards in the same fiscal year", async () => {
    await db.insert(awards).values({ factoryId: F_B, fiscalYear: 2023, grade: "gold" });
    const rows = await db.select().from(awards).where(eq(awards.fiscalYear, 2023));
    expect(rows.filter((r) => ALL_FACTORIES.includes(r.factoryId))).toHaveLength(2);
  });

  it("AC: many imported awards with no Cover coexist", async () => {
    await db.insert(awards).values([
      { factoryId: F_A, fiscalYear: 2024, grade: "gold", coverId: null },
      { factoryId: F_B, fiscalYear: 2024, grade: "gold", coverId: null },
    ]);
    const nullCover = await db
      .select()
      .from(awards)
      .where(and(eq(awards.fiscalYear, 2024), inArray(awards.factoryId, [F_A, F_B])));
    expect(nullCover).toHaveLength(2);
  });

  it("AC: a Cover is awarded at most once, and cannot be deleted while awarded", async () => {
    const { coverId } = await seedCover(F_A, { choice: "3", coverStatus: "in_review" });
    await db.insert(awards).values({
      factoryId: F_A,
      fiscalYear: currentYear,
      grade: "gold",
      coverId,
    });
    await rejects(
      db.insert(awards).values({
        factoryId: F_B,
        fiscalYear: currentYear,
        grade: "gold",
        coverId,
      }),
    );
    await rejects(db.delete(covers).where(eq(covers.id, coverId)));
  });
});

// ─── Finalize writes the award ───────────────────────────────────────────────

describe("Awards — finalize writes exactly one row", () => {
  let coverId: number;

  beforeAll(async () => {
    ({ coverId } = await seedCover(F_FINISHED, { choice: "3" }));
  });

  it("AC: finalize writes one row whose grade is what the Grade calculator returned", async () => {
    const res = await reviewService.finalize(coverId, odpcCtx);
    expect(code(res)).toBe(200);

    const rows = await awardsOf(coverId);
    expect(rows).toHaveLength(1);
    // Every category at "3" scores 100%, so the calculator's answer is gold.
    expect(rows[0].grade).toBe("gold");
    expect((res as unknown as { response: { grade: string } }).response.grade).toBe("gold");
  });

  it("AC: the row carries the Cover's fiscal year in Common Era and references the Cover", async () => {
    const [row] = await awardsOf(coverId);
    expect(row.fiscalYear).toBe(currentYear);
    expect(row.factoryId).toBe(F_FINISHED);
    expect(row.coverId).toBe(coverId);
  });

  it("AC: a second finalize of the same Cover cannot write a second award row or change the Grade", async () => {
    // Make a recomputation disagree with the stored gold, so keeping the first Grade is observable.
    await db.update(answers).set({ selectedChoice: "0" }).where(eq(answers.coverId, coverId));

    const again = await reviewService.finalize(coverId, odpcCtx);

    const rows = await awardsOf(coverId);
    expect(rows).toHaveLength(1);
    expect(rows[0].grade).toBe("gold");
    if (code(again) === 200) {
      expect((again as unknown as { response: { grade: string } }).response.grade).toBe("gold");
    }
  });

  it("AC: a Cover enrolled in the last minute of the previous fiscal year is awarded that year, not the current one", async () => {
    // 30 Sep 23:59 Bangkok — one minute before the rollover boundary — finalized long after it.
    const boundary = utilities().getFiscalYear(currentYear).fiscalYearStart;
    const enrollDate = new Date(boundary.getTime() - 60_000).toISOString();
    const { coverId: pastCover } = await seedCover(F_PAST, { choice: "3", enrollDate });

    const res = await reviewService.finalize(pastCover, odpcCtx);
    expect(code(res)).toBe(200);

    const [row] = await awardsOf(pastCover);
    expect(row.fiscalYear).toBe(currentYear - 1);
  });
});

// ─── Read paths return the stored Grade ──────────────────────────────────────

describe("Awards — read paths return the stored Grade", () => {
  it("AC: the staff list resolves a page's grades in a number of queries that does not grow with page size", async () => {
    let queries = 0;
    const countingDb = drizzle(pool, { logger: { logQuery: () => void queries++ } });
    const countingService = createScoreService(countingDb);

    const queriesFor = async (limit: number) => {
      queries = 0;
      const page = await countingService.getScoresByProvince(TEST_PROVINCE_ID, {
        page: 1,
        limit,
        fiscalYear: currentYear,
      });
      return { queries, items: page.items.length };
    };

    // The current year holds at least F_FINISHED and F_REVIEW in this province.
    const one = await queriesFor(1);
    const many = await queriesFor(100);
    expect(one.items).toBe(1);
    expect(many.items).toBeGreaterThan(1);
    expect(many.queries).toBe(one.queries);
  });

  it("AC: a Cover that is in_review has no award and every read path reports grade null", async () => {
    const { coverId } = await seedCover(F_REVIEW, { choice: "3", coverStatus: "in_review" });

    expect(await awardsOf(coverId)).toHaveLength(0);
    expect((await scoreOf(F_REVIEW, currentYear)).grade).toBeNull();

    const listed = await listAll(currentYear);
    expect(listed.find((r) => r.coverId === coverId)?.grade).toBeNull();
  });

  it("AC: re-reading a finished Cover returns the stored Grade, not a recomputed one", async () => {
    const [{ coverId }] = await db
      .select({ coverId: awards.coverId })
      .from(awards)
      .where(and(eq(awards.factoryId, F_FINISHED), eq(awards.fiscalYear, currentYear)));
    if (coverId === null) throw new Error("fixture: expected a Cover-backed award");

    // Stand in for "the grade rules in code have changed": the stored value diverges from what
    // the Answers would compute (gold), and the read must follow the stored value.
    await db.update(awards).set({ grade: "silver" }).where(eq(awards.coverId, coverId));

    expect((await scoreOf(F_FINISHED, currentYear)).grade).toBe("silver");
    const listed = await listAll(currentYear);
    expect(listed.find((r) => r.coverId === coverId)?.grade).toBe("silver");
  });

  it("AC: an Answer edited after finalization does not change the stored Grade", async () => {
    const [{ coverId }] = await db
      .select({ coverId: awards.coverId })
      .from(awards)
      .where(and(eq(awards.factoryId, F_FINISHED), eq(awards.fiscalYear, currentYear)));
    if (coverId === null) throw new Error("fixture: expected a Cover-backed award");

    await db.update(answers).set({ selectedChoice: "0" }).where(eq(answers.coverId, coverId));

    expect((await scoreOf(F_FINISHED, currentYear)).grade).toBe("silver");
    expect((await awardsOf(coverId))[0].grade).toBe("silver");
  });
});

// ─── Ticket 02: the FY-3 lookback ────────────────────────────────────────────

/** A history row: an award with no Cover, as the FY2566 import writes them. */
const seedHistory = (
  factoryId: number,
  fiscalYear: number,
  grade: (typeof awards.$inferInsert)["grade"],
) => db.insert(awards).values({ factoryId, fiscalYear, grade });

/** Enrol a factory in the given fiscal year (mid-year, Bangkok-safe) and return its Cover. */
const seedCoverIn = (factoryId: number, fiscalYear: number) => {
  const { fiscalYearStart } = utilities().getFiscalYear(fiscalYear);
  const enrollDate = new Date(fiscalYearStart.getTime() + 90 * 86_400_000).toISOString();
  return seedCover(factoryId, { choice: "3", enrollDate });
};

const finalizedGrade = async (coverId: number) => {
  const res = await reviewService.finalize(coverId, odpcCtx);
  expect(code(res)).toBe(200);
  return (res as unknown as { response: { grade: string } }).response.grade;
};

describe("Awards — the gold-tier history resolver", () => {
  const history = createAwardHistory(db);
  const year = currentYear - 10; // clear of every other fixture's fiscal years

  beforeAll(async () => {
    await seedHistory(F_A, year, "gold");
    await seedHistory(F_B, year, "consec-gold");
    await seedHistory(F_C1, year, "silver");
    await seedHistory(F_C2, year - 1, "gold");
  });

  it("AC: gold and consec-gold count as gold-tier; silver, certificate, joined and absence do not", async () => {
    expect(await history.heldGoldTierIn(F_A, year)).toBe(true);
    expect(await history.heldGoldTierIn(F_B, year)).toBe(true);
    expect(await history.heldGoldTierIn(F_C1, year)).toBe(false);
    expect(await history.heldGoldTierIn(F_C3, year)).toBe(false);
  });

  it("AC: only the asked fiscal year is consulted", async () => {
    expect(await history.heldGoldTierIn(F_C2, year)).toBe(false);
    expect(await history.heldGoldTierIn(F_C2, year - 1)).toBe(true);
    expect(await history.heldGoldTierIn(F_C2, year + 1)).toBe(false);
  });

  it("AC: a batch resolves every factory in one query however many are asked for", async () => {
    let queries = 0;
    const counting = createAwardHistory(
      drizzle(pool, { logger: { logQuery: () => void queries++ } }),
    );

    const two = await counting.goldTierFactoriesIn([F_A, F_C1], year);
    const queriesForTwo = queries;
    queries = 0;
    const five = await counting.goldTierFactoriesIn([F_A, F_B, F_C1, F_C2, F_C3], year);

    expect([...two]).toEqual([F_A]);
    expect([...five].sort()).toEqual([F_A, F_B].sort());
    expect(queries).toBe(queriesForTwo);
    expect(queries).toBe(1);
  });

  it("AC: an empty batch asks the database nothing", async () => {
    let queries = 0;
    const counting = createAwardHistory(
      drizzle(pool, { logger: { logQuery: () => void queries++ } }),
    );
    expect((await counting.goldTierFactoriesIn([], year)).size).toBe(0);
    expect(queries).toBe(0);
  });
});

describe("Awards — finalize grades consec-gold from the FY-3 award", () => {
  it("AC: a gold-gate Cover whose factory held gold in FY-3 finalizes as consec-gold, stored and returned", async () => {
    await seedHistory(F_C1, currentYear - 3, "gold");
    const { coverId } = await seedCoverIn(F_C1, currentYear);

    expect(await finalizedGrade(coverId)).toBe("consec-gold");
    expect((await awardsOf(coverId))[0].grade).toBe("consec-gold");
    expect((await scoreOf(F_C1, currentYear)).grade).toBe("consec-gold");
  });

  it("AC: an FY-3 grade of consec-gold also qualifies", async () => {
    await seedHistory(F_C2, currentYear - 3, "consec-gold");
    const { coverId } = await seedCoverIn(F_C2, currentYear);
    expect(await finalizedGrade(coverId)).toBe("consec-gold");
  });

  it("AC: an FY-3 silver, or no FY-3 award at all, finalizes as gold", async () => {
    await seedHistory(F_C3, currentYear - 3, "silver");
    const silverHistory = await seedCoverIn(F_C3, currentYear);
    expect(await finalizedGrade(silverHistory.coverId)).toBe("gold");

    const noHistory = await seedCoverIn(F_C4, currentYear);
    expect(await finalizedGrade(noHistory.coverId)).toBe("gold");
  });

  it("AC: only FY-3 is consulted — a gold in FY-1 or FY-2 does not make consec-gold", async () => {
    await seedHistory(F_C5, currentYear - 1, "gold");
    await seedHistory(F_C5, currentYear - 2, "gold");
    const { coverId } = await seedCoverIn(F_C5, currentYear);
    expect(await finalizedGrade(coverId)).toBe("gold");
  });

  it("AC: a past-year Cover finalized after rollover looks back from its own fiscal year", async () => {
    const past = currentYear - 1;
    await seedHistory(F_C6, past - 3, "gold");
    const { coverId } = await seedCoverIn(F_C6, past);

    expect(await finalizedGrade(coverId)).toBe("consec-gold");
    // FY-3 of the CURRENT year is not what was consulted.
    expect(await createAwardHistory(db).heldGoldTierIn(F_C6, currentYear - 3)).toBe(false);
  });
});

async function listAll(fiscalYear: number) {
  const out: { coverId: number; grade: string | null }[] = [];
  let page = 1;
  for (;;) {
    const result = await scoreService.getScoresByProvince(TEST_PROVINCE_ID, {
      page,
      limit: 100,
      fiscalYear,
    });
    out.push(...(result.items as { coverId: number; grade: string | null }[]));
    if (page >= result.meta.totalPages) break;
    page += 1;
  }
  return out;
}
