import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  answers,
  coverLogs,
  covers,
  districts,
  enrolls,
  evaluators,
  factories,
  provinces,
  questions,
  subdistricts,
} from "../drizzle/schema";
import { latestCoverLogFor } from "./coverStatus";
import { createScoreService } from "./score";

// ─── Test DB ─────────────────────────────────────────────────────────────────
//
// These tests mutate rows, so they may only run against an explicitly disposable, migrated, seeded
// database. When one is not reachable they SKIP with a stated reason rather than failing — an
// ECONNREFUSED stack is indistinguishable from a genuine regression in CI output.
//
// `pool.query` is wrapped to capture executed SQL. That is how the fan-out bound is asserted
// directly rather than inferred from timing, which would be flaky.

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });

const executed: string[] = [];
const originalQuery = pool.query.bind(pool);
// biome-ignore lint/suspicious/noExplicitAny: pg's query() is heavily overloaded; the wrapper is pass-through
(pool as any).query = (...args: any[]) => {
  const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
  if (typeof text === "string") executed.push(text);
  // biome-ignore lint/suspicious/noExplicitAny: see above
  return (originalQuery as any)(...args);
};

const db = drizzle(pool);
const scoreService = createScoreService(db);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[score-pagination.integration] SKIPPED — no reachable DATABASE_URL. " +
      "Start the database (docker compose --profile dev up) and re-run.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE = 99940;
const F_FINISHED = BASE + 1; // scorable, has answers, finished  → Grade expected
const F_IN_REVIEW = BASE + 2; // scorable, has answers, in_review → grade must be null
const F_NO_ANSWERS = BASE + 3; // scorable (in_review) but ZERO answers → INV-14
const F_IN_PROGRESS = BASE + 4; // not scorable → excluded
const F_NO_LOG = BASE + 5; // cover exists, no CoverLog → excluded
const ALL = [F_FINISHED, F_IN_REVIEW, F_NO_ANSWERS, F_IN_PROGRESS, F_NO_LOG];

const PROVINCE_A = 10;
let regionA: number;
let ref: { districtId: number; subdistrictId: number };
let evaluatorId: number;
let questionIds: number[];
const coverOf = new Map<number, number>();

const enrollValues = (factoryId: number) => ({
  factoryId,
  evalDohId: evaluatorId,
  evalOdpcId: evaluatorId,
  evalMentalId: evaluatorId,
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

async function cleanup(factoryId: number) {
  const enrollIds = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, factoryId))
    .then((r) => r.map((x) => x.id));
  if (enrollIds.length) {
    const coverIds = await db
      .select({ id: covers.id })
      .from(covers)
      .where(inArray(covers.enrollId, enrollIds))
      .then((r) => r.map((x) => x.id));
    if (coverIds.length) {
      await db.delete(answers).where(inArray(answers.coverId, coverIds));
      await db.delete(coverLogs).where(inArray(coverLogs.coverId, coverIds));
      await db.delete(covers).where(inArray(covers.id, coverIds));
    }
    await db.delete(enrolls).where(inArray(enrolls.id, enrollIds));
  }
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
}

async function seed(
  factoryId: number,
  statuses: Array<"in_progress" | "in_review" | "finished">,
  answerCount: number,
) {
  await db.insert(accounts).values({
    id: factoryId,
    username: `test_scorepage_${factoryId}`,
    password: "hashed",
    email: `test_scorepage_${factoryId}@test.local`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: factoryId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ score page",
    nameEn: "Test Score Page Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: PROVINCE_A,
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate: true,
  });
  const [enroll] = await db.insert(enrolls).values(enrollValues(factoryId)).returning();
  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  coverOf.set(factoryId, cover.id);
  for (const status of statuses) {
    await db.insert(coverLogs).values({ coverId: cover.id, status });
  }
  for (const questionId of questionIds.slice(0, answerCount)) {
    await db.insert(answers).values({ questionId, coverId: cover.id, selectedChoice: "2" });
  }
}

beforeAll(async () => {
  if (!dbReachable) return;

  regionA = await db
    .select({ r: provinces.healthRegion })
    .from(provinces)
    .where(eq(provinces.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0].r);

  ref = await db
    .select({ districtId: districts.districtId, subdistrictId: subdistricts.subdistrictId })
    .from(districts)
    .innerJoin(subdistricts, eq(subdistricts.districtId, districts.districtId))
    .limit(1)
    .then((r) => r[0]);

  evaluatorId = await db
    .select({ id: evaluators.accountId })
    .from(evaluators)
    .limit(1)
    .then((r) => r[0].id);

  questionIds = await db
    .select({ id: questions.id })
    .from(questions)
    .then((r) => r.map((x) => x.id));

  for (const id of ALL) await cleanup(id);

  await seed(F_FINISHED, ["in_progress", "finished"], 10);
  await seed(F_IN_REVIEW, ["in_progress", "in_review"], 10);
  await seed(F_NO_ANSWERS, ["in_review"], 0); // ← the INV-14 fixture
  await seed(F_IN_PROGRESS, ["in_progress"], 10);
  await seed(F_NO_LOG, [], 10);
});

afterAll(async () => {
  if (dbReachable) {
    for (const id of ALL) await cleanup(id);
  }
  await pool.end().catch(() => {});
});

type Report = {
  factoryId: number;
  coverStatus: string;
  grade: string | null;
  scoring: { total: { scoredCount: number } };
};

const allReports = async (
  fetch: (pg: { page: number; limit: number }) => Promise<{
    items: unknown[];
    meta: { totalPages: number };
  }>,
) => {
  const out: Report[] = [];
  let page = 1;
  for (;;) {
    const r = await fetch({ page, limit: 100 });
    out.push(...(r.items as Report[]));
    if (page >= r.meta.totalPages) break;
    page += 1;
  }
  return out;
};

const mine = (rows: Report[]) => rows.filter((r) => ALL.includes(r.factoryId));
const find = (rows: Report[], id: number) => rows.find((r) => r.factoryId === id);

// ─── Story 007: scorable filter pushed into SQL ──────────────────────────────

describeDb("Story 007 — scorable filter is a SQL predicate", () => {
  it("AC1: in_progress covers are excluded from items", async () => {
    const rows = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    expect(find(rows, F_IN_PROGRESS)).toBeUndefined();
  });

  it("AC2: a cover with NO CoverLog is excluded (status unresolved, not scorable)", async () => {
    const rows = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    expect(find(rows, F_NO_LOG)).toBeUndefined();
  });

  it("AC3: in_review and finished covers ARE included", async () => {
    const rows = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    expect(find(rows, F_FINISHED)).toBeDefined();
    expect(find(rows, F_IN_REVIEW)).toBeDefined();
  });

  it("AC4: latest-log-wins — an earlier in_progress does not disqualify a finished cover", async () => {
    // F_FINISHED has logs [in_progress, finished]; the greatest id must win.
    const rows = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    expect(find(rows, F_FINISHED)?.coverStatus).toBe("finished");
  });

  it("AC5: meta.total counts scorable covers only, not every cover in scope", async () => {
    const page = await scoreService.getScoresByProvince(PROVINCE_A, { limit: 1 });
    const rows = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    expect(page.meta.total).toBe(rows.length);
    // 3 of our 5 fixtures are scorable; the non-scorable two must not be counted.
    expect(mine(rows)).toHaveLength(3);
  });

  it("AC6: region scoping still applies and is reflected in total", async () => {
    const rows = await allReports((pg) => scoreService.getScoresByRegion(regionA, pg));
    expect(find(rows, F_FINISHED)).toBeDefined();
  });
});

// ─── Story 008: page-scoped hydration ────────────────────────────────────────

describeDb("Story 008 — hydration is page-scoped and never filters", () => {
  it("AC1 (INV-14): a scorable cover with ZERO answers still appears, with an empty breakdown", async () => {
    // The single most important assertion in this bolt. Expressing hydration as an inner join
    // would silently drop this cover, making items.length disagree with total.
    const rows = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    const report = find(rows, F_NO_ANSWERS);
    expect(report).toBeDefined();
    expect(report?.scoring.total.scoredCount).toBe(0);
  });

  it("AC2: items.length never exceeds limit, and equals the covers on the page", async () => {
    const page = await scoreService.getScoresByProvince(PROVINCE_A, { limit: 2 });
    expect(page.items.length).toBeLessThanOrEqual(2);
  });

  it("AC3: the answer query receives at most `limit` cover ids — the fan-out bound", async () => {
    executed.length = 0;
    await scoreService.getScoresByProvince(PROVINCE_A, { limit: 1 });
    const answerQueries = executed.filter((sql) => /from "Answers"/i.test(sql));
    expect(answerQueries.length).toBe(1);
    // One placeholder per cover id in the IN list.
    const inList = /"cover_id" in \(([^)]*)\)/i.exec(answerQueries[0]);
    expect(inList).not.toBeNull();
    expect((inList?.[1].match(/\$\d+/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("AC4: an empty page issues NO answer query at all", async () => {
    executed.length = 0;
    const page = await scoreService.getScoresByProvince(PROVINCE_A, { page: 9999, limit: 5 });
    expect(page.items).toEqual([]);
    expect(executed.filter((sql) => /from "Answers"/i.test(sql))).toHaveLength(0);
  });

  it("AC5: fan-out does not grow with the population — same query count for limit 1 and limit 3", async () => {
    executed.length = 0;
    await scoreService.getScoresByProvince(PROVINCE_A, { limit: 1 });
    const one = executed.filter((sql) => /from "Answers"/i.test(sql)).length;
    executed.length = 0;
    await scoreService.getScoresByProvince(PROVINCE_A, { limit: 3 });
    const three = executed.filter((sql) => /from "Answers"/i.test(sql)).length;
    expect(one).toBe(1);
    expect(three).toBe(1);
  });
});

// ─── Story 009: pagination contract + inherited Grade rule ───────────────────

describeDb("Story 009 — score list pagination", () => {
  it("AC1 (INV-12): finished cover carries a Grade; in_review carries null", async () => {
    const rows = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    expect(find(rows, F_FINISHED)?.grade).not.toBeNull();
    expect(find(rows, F_IN_REVIEW)?.grade).toBeNull();
  });

  it("AC2: totalPages = ceil(total / limit)", async () => {
    const page = await scoreService.getScoresByProvince(PROVINCE_A, { limit: 2 });
    expect(page.meta.totalPages).toBe(Math.ceil(page.meta.total / 2));
  });

  it("AC3: a page beyond the end is an empty page with accurate meta, not an error", async () => {
    const first = await scoreService.getScoresByProvince(PROVINCE_A, { limit: 2 });
    const beyond = await scoreService.getScoresByProvince(PROVINCE_A, {
      limit: 2,
      page: first.meta.totalPages + 5,
    });
    expect(beyond.items).toEqual([]);
    expect(beyond.meta.total).toBe(first.meta.total);
  });

  it("AC4: page stability — every report appears exactly once across all pages", async () => {
    const first = await scoreService.getScoresByProvince(PROVINCE_A, { limit: 1 });
    const seen: number[] = [];
    for (let page = 1; page <= first.meta.totalPages; page++) {
      const p = await scoreService.getScoresByProvince(PROVINCE_A, { page, limit: 1 });
      seen.push(...(p.items as Report[]).map((r) => r.factoryId));
    }
    expect(seen.length).toBe(first.meta.total);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("AC5: ordering is total and stable — ascending factoryId, identical across calls", async () => {
    const a = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    const b = await allReports((pg) => scoreService.getScoresByProvince(PROVINCE_A, pg));
    expect(a.map((r) => r.factoryId)).toEqual(b.map((r) => r.factoryId));
    const ids = mine(a).map((r) => r.factoryId);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
  });

  it("AC6: all three role variants return the same envelope shape", async () => {
    for (const page of [
      await scoreService.getAllScores(undefined, { limit: 2 }),
      await scoreService.getScoresByRegion(regionA, { limit: 2 }),
      await scoreService.getScoresByProvince(PROVINCE_A, { limit: 2 }),
    ]) {
      expect(Object.keys(page).sort()).toEqual(["items", "meta"]);
      expect(Object.keys(page.meta).sort()).toEqual(["limit", "page", "total", "totalPages"]);
    }
  });
});

// ─── getScoreByFactory regression after the latestCoverLogFor migration ──────

describeDb("getScoreByFactory — unchanged after migrating to the shared helper", () => {
  it("AC1: finished cover returns a report with a Grade", async () => {
    const result = (await scoreService.getScoreByFactory(F_FINISHED)) as Report;
    expect(result.coverStatus).toBe("finished");
    expect(result.grade).not.toBeNull();
  });

  it("AC2: in_review cover returns a report with grade null", async () => {
    const result = (await scoreService.getScoreByFactory(F_IN_REVIEW)) as Report;
    expect(result.coverStatus).toBe("in_review");
    expect(result.grade).toBeNull();
  });

  it("AC3: in_progress cover still returns the existing 400", async () => {
    const result = await scoreService.getScoreByFactory(F_IN_PROGRESS);
    expect((result as { code?: number }).code ?? (result as { status?: number }).status).toBe(400);
  });

  it("AC4: a cover with no CoverLog falls back to in_progress and returns 400", async () => {
    const result = await scoreService.getScoreByFactory(F_NO_LOG);
    expect((result as { code?: number }).code ?? (result as { status?: number }).status).toBe(400);
  });
});

// ─── coverStatus.ts shape B — direct tests ───────────────────────────────────
//
// `latestCoverLogLateral` got SQL-shape tests in bolt 026. `latestCoverLogFor` executes a query, so
// it needs a database and is tested here. The module is now the single source of the latest-log-wins
// rule for every caller, so it is tested directly rather than only through its consumers.

describeDb("coverStatus — latestCoverLogFor (shape B)", () => {
  it("AC1: returns the status of the greatest-id CoverLog, not the first", async () => {
    // F_FINISHED has logs [in_progress, finished]
    const coverId = coverOf.get(F_FINISHED) as number;
    expect(await latestCoverLogFor(db, coverId)).toBe("finished");
  });

  it("AC2: returns null when the Cover has no CoverLog at all", async () => {
    const coverId = coverOf.get(F_NO_LOG) as number;
    expect(await latestCoverLogFor(db, coverId)).toBeNull();
  });

  it("AC3: ordering is by id, not by timestamp — an older row with a future timestamp does not win", async () => {
    const coverId = coverOf.get(F_IN_REVIEW) as number;
    // Insert a NEWER row (greater id) carrying an OLDER timestamp than the existing logs.
    await db.insert(coverLogs).values({
      coverId,
      status: "finished",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });
    // Greatest id wins despite the ancient timestamp.
    expect(await latestCoverLogFor(db, coverId)).toBe("finished");

    // restore the fixture for any later test in this file
    const newest = await db
      .select({ id: coverLogs.id })
      .from(coverLogs)
      .where(eq(coverLogs.coverId, coverId))
      .orderBy(desc(coverLogs.id))
      .limit(1)
      .then((r) => r[0].id);
    await db.delete(coverLogs).where(eq(coverLogs.id, newest));
    expect(await latestCoverLogFor(db, coverId)).toBe("in_review");
  });

  it("AC4: returns null for a cover id that does not exist", async () => {
    expect(await latestCoverLogFor(db, -1)).toBeNull();
  });
});
