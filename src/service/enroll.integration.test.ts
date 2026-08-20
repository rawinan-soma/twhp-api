import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { t } from "elysia";
import { Pool } from "pg";
import {
  accounts,
  coverLogs,
  covers,
  districts,
  enrolls,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import { CoverStatusQuery, EnrollWithCoverListSchema } from "../schema/enroll";
import { createEnrollService } from "./enroll";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const enrollService = createEnrollService(db);

// ─── Fixture constants ───────────────────────────────────────────────────────

const FACTORY_A = 99971; // province A (region A)
const FACTORY_B = 99972; // a different province (region B) — for scope-exclusion tests
const PROVINCE_A = 10; // seeded province (verdict test asserts region 13, but we read it live)
const SEEDED_EVALUATOR_ID = 78; // seeded ODPC evaluator (FK target for enroll eval_* ids)

type CoverStatus = "finished" | "in_progress" | "in_review";

let regionA: number;
let provinceB: number;

// seeded enroll ids
let enrollFinished: number; // cover with logs [in_progress → finished] (proves latest-log-wins)
let enrollInProgress: number; // cover [in_progress]
let enrollInReview: number; // cover [in_review]
let enrollNoCover: number; // no cover
let enrollBFinished: number; // factory B, cover [finished] — out of A's scope
let enrollCoverNoLogs: number; // cover exists, zero coverLogs → coverStatus null but NOT `none`
let enrollSameDateA: number; // shares an enrollDate with enrollSameDateB (tiebreaker fixture)
let enrollSameDateB: number;

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

/** Insert an enroll for the factory plus a cover with the given status history (latest wins). */
async function seedEnrollWithCover(factoryId: number, statuses: CoverStatus[]) {
  const [enroll] = await db.insert(enrolls).values(enrollValues(factoryId)).returning();
  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  for (const status of statuses) {
    await db.insert(coverLogs).values({ coverId: cover.id, status });
  }
  return { enrollId: enroll.id, coverId: cover.id };
}

/**
 * Insert an enroll whose cover exists but has NO coverLogs.
 *
 * This is the fixture that separates the two distinct sources of a null coverStatus. Without it,
 * `coverStatus=none` cannot be distinguished from "cover exists but is unresolved", and an
 * implementation that wrote the `none` filter as `latest.status IS NULL` would pass every other
 * test in this file. See docs/adr/0010.
 */
async function seedEnrollCoverNoLogs(factoryId: number) {
  const [enroll] = await db.insert(enrolls).values(enrollValues(factoryId)).returning();
  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  return { enrollId: enroll.id, coverId: cover.id };
}

/** Insert an enroll for the factory with no cover. */
async function seedEnrollNoCover(factoryId: number) {
  const [enroll] = await db.insert(enrolls).values(enrollValues(factoryId)).returning();
  return enroll.id;
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
      await db.delete(coverLogs).where(eq(coverLogs.coverId, c.id));
      await db.delete(covers).where(eq(covers.id, c.id));
    }
    await db.delete(enrolls).where(eq(enrolls.id, e.id));
  }
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
}

async function seedFactory(
  accountId: number,
  provinceId: number,
  ref: { districtId: number; subdistrictId: number },
) {
  await db.insert(accounts).values({
    id: accountId,
    username: `test_enroll_cover_${accountId}`,
    password: "hashed",
    email: `test_enroll_cover_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ cover filter",
    nameEn: "Test Cover Filter Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId,
    districtId: ref.districtId,
    subdistrictId: ref.subdistrictId,
    isValidate: true,
  });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  await cleanupFactory(FACTORY_A);
  await cleanupFactory(FACTORY_B);

  // region for province A (live, not hard-coded)
  regionA = await db
    .select({ r: provinces.healthRegion })
    .from(provinces)
    .where(eq(provinces.provinceId, PROVINCE_A))
    .limit(1)
    .then((r) => r[0].r);

  // pick a different province in a different health region for scope-exclusion tests
  const other = await db
    .select({ p: provinces.provinceId, r: provinces.healthRegion })
    .from(provinces)
    .where(ne(provinces.healthRegion, regionA))
    .limit(1)
    .then((r) => r[0]);
  provinceB = other.p;

  // Derive a valid district/subdistrict from the reference tables to satisfy FKs.
  //
  // This previously borrowed the pair from an existing `Factories` row, which silently assumed some
  // factory already existed. On a freshly seeded database `Factories` is empty, so `ref` was
  // undefined and every test in this file died in beforeAll. Reference tables are always seeded.
  const ref = await db
    .select({ districtId: districts.districtId, subdistrictId: subdistricts.subdistrictId })
    .from(districts)
    .innerJoin(subdistricts, eq(subdistricts.districtId, districts.districtId))
    .limit(1)
    .then((r) => r[0]);

  await seedFactory(FACTORY_A, PROVINCE_A, ref);
  await seedFactory(FACTORY_B, provinceB, ref);

  enrollFinished = (await seedEnrollWithCover(FACTORY_A, ["in_progress", "finished"])).enrollId;
  enrollInProgress = (await seedEnrollWithCover(FACTORY_A, ["in_progress"])).enrollId;
  enrollInReview = (await seedEnrollWithCover(FACTORY_A, ["in_review"])).enrollId;
  enrollNoCover = await seedEnrollNoCover(FACTORY_A);
  enrollBFinished = (await seedEnrollWithCover(FACTORY_B, ["finished"])).enrollId;

  // Cover with zero logs — separates "no cover" from "cover with unresolved status".
  enrollCoverNoLogs = (await seedEnrollCoverNoLogs(FACTORY_A)).enrollId;

  // Two enrolls sharing one enrollDate — without a unique tiebreaker their relative order is
  // undefined and OFFSET can repeat or skip one of them across a page boundary.
  const sharedDate = new Date().toISOString();
  enrollSameDateA = (
    await db
      .insert(enrolls)
      .values({ ...enrollValues(FACTORY_A), enrollDate: sharedDate })
      .returning()
  )[0].id;
  enrollSameDateB = (
    await db
      .insert(enrolls)
      .values({ ...enrollValues(FACTORY_A), enrollDate: sharedDate })
      .returning()
  )[0].id;
});

afterAll(async () => {
  await cleanupFactory(FACTORY_A);
  await cleanupFactory(FACTORY_B);
  await pool.end();
});

// helpers for assertions
type Row = { id: number; coverId: number | null; coverStatus: string | null };
const byId = (rows: Row[], id: number) => rows.find((r) => r.id === id);
const ids = (rows: Row[]) => new Set(rows.map((r) => r.id));

/**
 * Intent 012 wrapped these list endpoints in a pagination envelope, so every call site below now
 * pages through the result instead of reading a bare array.
 *
 * Every assertion in this file is UNCHANGED from before that rewrite, and that is the point: these
 * assertions were written against the previous JavaScript-side cover-status filter, so their
 * continued passing is the membership-parity proof for the SQL pushdown (docs/adr/0010). Do not
 * relax an assertion here to make the new query pass — the assertion is the reference.
 *
 * Paging through all pages (rather than requesting one large page) also exercises page stability:
 * a duplicated or skipped row would break the `toHaveLength(4)` and set assertions below.
 */
type Page = { items: unknown[]; meta: { totalPages: number } };
const allRows = async (fetch: (pg: { page: number; limit: number }) => Promise<Page>) => {
  const out: Row[] = [];
  let page = 1;
  for (;;) {
    const result = await fetch({ page, limit: 100 });
    out.push(...(result.items as Row[]));
    if (page >= result.meta.totalPages) break;
    page += 1;
  }
  return out;
};

// ─── Story 001 — derivation + filter (service) ───────────────────────────────

describe("Story 001 — cover-status derivation and filter", () => {
  it("AC: enroll with cover → coverId + latest coverStatus (latest-log-wins)", async () => {
    const rows = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, undefined, pg),
    );
    const r = byId(rows, enrollFinished);
    expect(r).toBeDefined();
    // cover had [in_progress, finished]; latest (highest id) wins
    expect(r?.coverStatus).toBe("finished");
    expect(typeof r?.coverId).toBe("number");
  });

  it("AC: enroll with no cover → coverId null, coverStatus null", async () => {
    const rows = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, undefined, pg),
    );
    const r = byId(rows, enrollNoCover);
    expect(r).toBeDefined();
    expect(r?.coverId).toBeNull();
    expect(r?.coverStatus).toBeNull();
  });

  it("AC: coverStatus=finished → only finished; other statuses and no-cover excluded", async () => {
    const rows = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, "finished", pg),
    );
    const set = ids(rows);
    expect(set.has(enrollFinished)).toBe(true);
    expect(set.has(enrollInProgress)).toBe(false);
    expect(set.has(enrollInReview)).toBe(false);
    expect(set.has(enrollNoCover)).toBe(false);
    // every returned row really is finished
    expect(rows.every((r) => r.coverStatus === "finished")).toBe(true);
  });

  it("AC: coverStatus=in_progress → only in_progress", async () => {
    const rows = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, "in_progress", pg),
    );
    const set = ids(rows);
    expect(set.has(enrollInProgress)).toBe(true);
    expect(set.has(enrollFinished)).toBe(false);
    expect(rows.every((r) => r.coverStatus === "in_progress")).toBe(true);
  });

  it("AC: coverStatus=in_review → only in_review", async () => {
    const rows = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, "in_review", pg),
    );
    const set = ids(rows);
    expect(set.has(enrollInReview)).toBe(true);
    expect(set.has(enrollFinished)).toBe(false);
    expect(rows.every((r) => r.coverStatus === "in_review")).toBe(true);
  });

  it("AC: coverStatus=none → only enrolls with no cover", async () => {
    const rows = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, "none", pg),
    );
    const set = ids(rows);
    expect(set.has(enrollNoCover)).toBe(true);
    expect(set.has(enrollFinished)).toBe(false);
    expect(set.has(enrollInProgress)).toBe(false);
    // every returned row truly has no cover
    expect(rows.every((r) => r.coverId === null && r.coverStatus === null)).toBe(true);
  });

  it("AC: no filter → all in-scope enrolls (incl. no-cover) returned and enriched", async () => {
    const rows = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, undefined, pg),
    );
    const set = ids(rows);
    for (const id of [enrollFinished, enrollInProgress, enrollInReview, enrollNoCover]) {
      expect(set.has(id)).toBe(true);
    }
    // enrichment fields present on every row
    expect(rows.every((r) => "coverId" in r && "coverStatus" in r)).toBe(true);
  });

  it("AC: filter is AND-combined with REGION scope (narrows, never widens)", async () => {
    // both factory A (regionA) and factory B (regionB) have a finished cover
    const all = ids(
      await allRows((pg) => enrollService.getAllEnrolls(undefined, undefined, "finished", pg)),
    );
    expect(all.has(enrollFinished)).toBe(true);
    expect(all.has(enrollBFinished)).toBe(true);

    const scoped = ids(
      await allRows((pg) => enrollService.getAllEnrolls(regionA, undefined, "finished", pg)),
    );
    expect(scoped.has(enrollFinished)).toBe(true); // in region A
    expect(scoped.has(enrollBFinished)).toBe(false); // region B excluded by scope
  });

  it("AC: filter is AND-combined with PROVINCE scope (getAllEnrollsByProvince)", async () => {
    const scoped = ids(
      await allRows((pg) => enrollService.getAllEnrollsByProvince(PROVINCE_A, "finished", pg)),
    );
    expect(scoped.has(enrollFinished)).toBe(true); // province A
    expect(scoped.has(enrollBFinished)).toBe(false); // province B excluded
    // province scope without filter still enriches + includes no-cover
    const unfiltered = await allRows((pg) =>
      enrollService.getAllEnrollsByProvince(PROVINCE_A, undefined, pg),
    );
    const set = ids(unfiltered);
    expect(set.has(enrollNoCover)).toBe(true);
    expect(byId(unfiltered, enrollFinished)?.coverStatus).toBe("finished");
  });
});

// ─── Intent 012 — fixtures the SQL pushdown must distinguish ─────────────────
//
// Added by bolt 026. These cover the cases the pre-pagination suite never needed, because a
// JavaScript filter over an already-fetched array cannot get them wrong in the way a SQL predicate
// can. Every one of them targets a specific way the pushdown could be written plausibly and wrongly.

describe("Intent 012 — cover-status pushdown edge cases", () => {
  it("AC: a cover with NO logs yields coverStatus null but is NOT matched by `none`", async () => {
    const all = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, undefined, pg),
    );
    const row = byId(all, enrollCoverNoLogs);
    expect(row).toBeDefined();
    expect(typeof row?.coverId).toBe("number"); // the cover DOES exist
    expect(row?.coverStatus).toBeNull(); // but has no resolved status

    const none = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, "none", pg),
    );
    // `none` means "no cover at all". Writing it as `latest.status IS NULL` would wrongly match here.
    expect(ids(none).has(enrollCoverNoLogs)).toBe(false);
    expect(ids(none).has(enrollNoCover)).toBe(true);
  });

  it("AC: a cover with no logs is excluded by every positive status filter", async () => {
    for (const status of ["finished", "in_progress", "in_review"] as const) {
      const rows = await allRows((pg) =>
        enrollService.getAllEnrolls(undefined, undefined, status, pg),
      );
      expect(ids(rows).has(enrollCoverNoLogs)).toBe(false);
    }
  });

  it("AC: enrolls sharing an enrollDate have a stable, total order across pages", async () => {
    const first = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      page: 1,
      limit: 2,
    });
    const collected: number[] = [];
    for (let page = 1; page <= first.meta.totalPages; page++) {
      const result = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
        page,
        limit: 2,
      });
      collected.push(...(result.items as Row[]).map((r) => r.id));
    }
    // both same-date enrolls appear, each exactly once
    expect(collected.filter((id) => id === enrollSameDateA)).toHaveLength(1);
    expect(collected.filter((id) => id === enrollSameDateB)).toHaveLength(1);
    expect(new Set(collected).size).toBe(collected.length);
    expect(collected.length).toBe(first.meta.total);
  });

  it("AC: meta.total counts the filtered population, not the unfiltered one", async () => {
    const unfiltered = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 1,
    });
    const finished = await enrollService.getAllEnrolls(undefined, undefined, "finished", {
      limit: 1,
    });
    // The old JavaScript filter ran AFTER the query, so a count taken alongside it would have
    // described the unfiltered set. These must differ.
    expect(finished.meta.total).toBeLessThan(unfiltered.meta.total);
    const allFinished = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, "finished", pg),
    );
    expect(finished.meta.total).toBe(allFinished.length);
  });

  it("AC: one row per enroll — the lateral must not multiply a multi-log cover", async () => {
    const all = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, undefined, pg),
    );
    // enrollFinished's cover has TWO logs; without LIMIT 1 in the lateral it would appear twice.
    expect(all.filter((r) => r.id === enrollFinished)).toHaveLength(1);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  });

  it("AC: a page beyond the end is an empty page, not an error", async () => {
    const first = await enrollService.getAllEnrolls(undefined, undefined, undefined, { limit: 5 });
    const beyond = await enrollService.getAllEnrolls(undefined, undefined, undefined, {
      limit: 5,
      page: first.meta.totalPages + 10,
    });
    expect(beyond.items).toEqual([]);
    expect(beyond.meta.total).toBe(first.meta.total);
  });
});

// ─── Story 002 — shared response schema ──────────────────────────────────────

describe("Story 002 — enroll cover response schema", () => {
  it("AC: enriched rows (incl. null cover fields) conform to EnrollWithCoverListSchema", async () => {
    const all = await allRows((pg) =>
      enrollService.getAllEnrolls(undefined, undefined, undefined, pg),
    );
    // check our seeded subset (cover present + cover absent) against the shared schema
    const subset = all.filter((r) =>
      [enrollFinished, enrollInProgress, enrollInReview, enrollNoCover].includes(r.id),
    );
    expect(subset).toHaveLength(4);
    expect(Value.Check(EnrollWithCoverListSchema, subset)).toBe(true);
  });
});

// ─── Story 003 — coverStatus query contract (backs the 400 path) ─────────────

// The routes declare `query: t.Object({ coverStatus: CoverStatusQuery })`.
// Validate against that exact shape — it backs the 400-on-invalid behaviour.
const QuerySchema = t.Object({ coverStatus: CoverStatusQuery });

describe("Story 003 — coverStatus query param contract", () => {
  it("AC: query accepts the 4 valid values and omission", () => {
    for (const v of ["finished", "in_progress", "in_review", "none"]) {
      expect(Value.Check(QuerySchema, { coverStatus: v })).toBe(true);
    }
    expect(Value.Check(QuerySchema, {})).toBe(true); // omitted → optional, behaviour-preserving
  });

  it("AC: query rejects invalid values (→ 400 at the route boundary)", () => {
    for (const v of ["FINISHED", "", "done", "in-progress", 1]) {
      expect(Value.Check(QuerySchema, { coverStatus: v })).toBe(false);
    }
  });
});

// NOTE (FLAGGED): The route-level 400 short-circuit and the JWT scope resolution
// for /evaluators/enrolls and /provincialOfficers/enrolls are enforced by TypeBox
// (query schema above) + the shared guards + elysia-autoload, the same wiring used
// by sibling routes. They are not mounted here because an isolated route mount does
// not reproduce the autoload scope-composition pipeline (see the same caveat in
// evaluator-review.integration.test.ts). Service-level scope composition IS covered
// above; the 400 contract is covered by the CoverStatusQuery checks.
