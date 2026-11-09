import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  geoOf,
  pickRegionLayout,
  type RegionLayout,
  removeFactoryWithCovers,
  seedEnrollWithCover,
  seedFactoryInProvince,
} from "../test/staff-list-fixtures";
import { utilities } from "../utils";
import { createEnrollService } from "./enroll";
import { createScoreService } from "./score";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const enrollService = createEnrollService(db);
const scoreService = createScoreService(db);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn(
    "[enroll-score-province-filter.evaluator.integration] SKIPPED, no reachable DATABASE_URL.",
  );
}

const describeDb = dbReachable ? describe : describe.skip;

const P1_REVIEW = 99950;
const P1_REVIEW_B = 99951;
const P1_PROGRESS = 99952;
const P1_NO_COVER = 99953;
const P1_LAST_YEAR = 99954;
const P2_REVIEW = 99955;
const OUT_REVIEW = 99956;
const ALL = [P1_REVIEW, P1_REVIEW_B, P1_PROGRESS, P1_NO_COVER, P1_LAST_YEAR, P2_REVIEW, OUT_REVIEW];
const UNKNOWN_PROVINCE = 999999;

let layout: RegionLayout;
let fiscalYear: number;
let lastFiscalYear: number;

beforeAll(async () => {
  if (!dbReachable) return;

  layout = await pickRegionLayout(db);
  fiscalYear = utilities().getFiscalYear().fiscalYear;
  lastFiscalYear = fiscalYear - 1;
  const thisYear = utilities().getFiscalYear(fiscalYear).fiscalYearStart.toISOString();
  const lastYear = utilities().getFiscalYear(lastFiscalYear).fiscalYearStart.toISOString();

  const geo = {
    [layout.provinceInRegion]: await geoOf(db, layout.provinceInRegion),
    [layout.otherProvinceInRegion]: await geoOf(db, layout.otherProvinceInRegion),
    [layout.provinceOutOfRegion]: await geoOf(db, layout.provinceOutOfRegion),
  };

  for (const id of ALL) await removeFactoryWithCovers(db, id);

  const place = [
    [P1_REVIEW, layout.provinceInRegion, thisYear, "in_review"],
    [P1_REVIEW_B, layout.provinceInRegion, thisYear, "in_review"],
    [P1_PROGRESS, layout.provinceInRegion, thisYear, "in_progress"],
    [P1_NO_COVER, layout.provinceInRegion, thisYear, "none"],
    [P1_LAST_YEAR, layout.provinceInRegion, lastYear, "in_review"],
    [P2_REVIEW, layout.otherProvinceInRegion, thisYear, "in_review"],
    [OUT_REVIEW, layout.provinceOutOfRegion, thisYear, "in_review"],
  ] as const;
  for (const [id, provinceId, date, state] of place) {
    await seedFactoryInProvince(db, id, provinceId, geo[provinceId]);
    await seedEnrollWithCover(db, id, date, state);
  }
});

afterAll(async () => {
  if (dbReachable) {
    for (const id of ALL) await removeFactoryWithCovers(db, id);
  }
  await pool.end().catch(() => {});
});

type EnrollPage = Awaited<ReturnType<typeof enrollService.getAllEnrolls>>;
type ScorePage = Awaited<ReturnType<typeof scoreService.getScoresByRegion>>;

const enrollIds = (page: EnrollPage) =>
  page.items.map((i) => i.factoryId).filter((id) => ALL.includes(id));
const scoreIds = (page: ScorePage) =>
  page.items.map((i) => i.factoryId).filter((id) => ALL.includes(id));
const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

const enrolls = (
  provinceId?: number,
  coverStatus?: "finished" | "in_progress" | "in_review" | "none",
  pagination: { page?: number; limit?: number; fiscalYear?: number } = {},
) =>
  enrollService.getAllEnrolls(layout.region, provinceId, coverStatus, {
    fiscalYear,
    limit: 100,
    ...pagination,
  });

const scores = (
  provinceId?: number,
  pagination: { page?: number; limit?: number; fiscalYear?: number } = {},
) =>
  scoreService.getScoresByRegion(layout.region, {
    fiscalYear,
    limit: 100,
    provinceId,
    ...pagination,
  });

describeDb("evaluator enrollment list narrowed by province inside the region", () => {
  it("returns only the province's enrollments, excluding siblings and other regions", async () => {
    const page = await enrolls(layout.provinceInRegion);
    expect(sorted(enrollIds(page))).toEqual([P1_REVIEW, P1_REVIEW_B, P1_PROGRESS, P1_NO_COVER]);
  });

  it("returns the sibling province's own enrollments for that province", async () => {
    const page = await enrolls(layout.otherProvinceInRegion);
    expect(enrollIds(page)).toEqual([P2_REVIEW]);
  });

  it("returns the whole region when no province is given", async () => {
    const page = await enrolls();
    expect(sorted(enrollIds(page))).toEqual([
      P1_REVIEW,
      P1_REVIEW_B,
      P1_PROGRESS,
      P1_NO_COVER,
      P2_REVIEW,
    ]);
  });

  it("returns an empty page with total 0 for a province outside the region", async () => {
    const page = await enrolls(layout.provinceOutOfRegion);
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("returns an empty page with total 0 for an unknown province", async () => {
    const page = await enrolls(UNKNOWN_PROVINCE);
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("never lists the out-of-region factory, whichever province is asked for", async () => {
    for (const provinceId of [undefined, layout.provinceInRegion, layout.otherProvinceInRegion]) {
      expect(enrollIds(await enrolls(provinceId))).not.toContain(OUT_REVIEW);
    }
  });

  it("reports a total that matches the filtered rows", async () => {
    const filtered = await enrolls(layout.provinceInRegion);
    expect(filtered.meta.total).toBe(filtered.items.length);
    const wholeRegion = await enrolls();
    expect(wholeRegion.meta.total).toBe(wholeRegion.items.length);
    expect(filtered.meta.total).toBeLessThan(wholeRegion.meta.total);
  });

  it("combines with coverStatus", async () => {
    const review = await enrolls(layout.provinceInRegion, "in_review");
    expect(sorted(enrollIds(review))).toEqual([P1_REVIEW, P1_REVIEW_B]);
    expect(review.meta.total).toBe(review.items.length);

    const none = await enrolls(layout.provinceInRegion, "none");
    expect(enrollIds(none)).toEqual([P1_NO_COVER]);
  });

  it("combines coverStatus with an out-of-region province into an empty page", async () => {
    const page = await enrolls(layout.provinceOutOfRegion, "in_review");
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("combines with fiscalYear, selecting the enrollment from that year", async () => {
    const page = await enrolls(layout.provinceInRegion, undefined, { fiscalYear: lastFiscalYear });
    expect(enrollIds(page)).toEqual([P1_LAST_YEAR]);
    expect(page.meta.total).toBe(page.items.length);
  });

  it("combines with pagination, keeping total at the filtered count", async () => {
    const full = await enrolls(layout.provinceInRegion);
    const pages = [];
    for (const page of [1, 2, 3, 4, 5]) {
      pages.push(await enrolls(layout.provinceInRegion, undefined, { page, limit: 1 }));
    }
    for (const p of pages) expect(p.meta.total).toBe(full.meta.total);
    const seen = pages.flatMap(enrollIds);
    expect(sorted(seen)).toEqual(sorted(enrollIds(full)));
    expect(pages[full.meta.total].items).toEqual([]);
  });
});

describeDb("evaluator score report list narrowed by province inside the region", () => {
  it("returns only the province's scorable covers, excluding siblings and other regions", async () => {
    const page = await scores(layout.provinceInRegion);
    expect(scoreIds(page)).toEqual([P1_REVIEW, P1_REVIEW_B]);
  });

  it("returns the sibling province's own reports for that province", async () => {
    const page = await scores(layout.otherProvinceInRegion);
    expect(scoreIds(page)).toEqual([P2_REVIEW]);
  });

  it("returns the whole region when no province is given", async () => {
    const page = await scores();
    expect(scoreIds(page)).toEqual([P1_REVIEW, P1_REVIEW_B, P2_REVIEW]);
  });

  it("returns an empty page with total 0 for a province outside the region", async () => {
    const page = await scores(layout.provinceOutOfRegion);
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("returns an empty page with total 0 for an unknown province", async () => {
    const page = await scores(UNKNOWN_PROVINCE);
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it("never lists the out-of-region factory, whichever province is asked for", async () => {
    for (const provinceId of [undefined, layout.provinceInRegion, layout.otherProvinceInRegion]) {
      expect(scoreIds(await scores(provinceId))).not.toContain(OUT_REVIEW);
    }
  });

  it("reports a total that matches the filtered rows", async () => {
    const filtered = await scores(layout.provinceInRegion);
    expect(filtered.meta.total).toBe(filtered.items.length);
    const wholeRegion = await scores();
    expect(wholeRegion.meta.total).toBe(wholeRegion.items.length);
    expect(filtered.meta.total).toBeLessThan(wholeRegion.meta.total);
  });

  it("combines with fiscalYear, selecting the report from that year", async () => {
    const page = await scores(layout.provinceInRegion, { fiscalYear: lastFiscalYear });
    expect(scoreIds(page)).toEqual([P1_LAST_YEAR]);
    expect(page.meta.total).toBe(page.items.length);
  });

  it("combines with pagination, keeping total at the filtered count", async () => {
    const full = await scores(layout.provinceInRegion);
    const pages = [];
    for (const page of [1, 2, 3, 4]) {
      pages.push(await scores(layout.provinceInRegion, { page, limit: 1 }));
    }
    for (const p of pages) expect(p.meta.total).toBe(full.meta.total);
    expect(pages.flatMap(scoreIds)).toEqual(scoreIds(full));
    expect(pages[full.meta.total].items).toEqual([]);
  });

  it("still scopes by region when the region-scoped read is given a province", async () => {
    const page = await scoreService.getScoresByRegion(layout.outOfRegionRegion, {
      fiscalYear,
      limit: 100,
      provinceId: layout.provinceInRegion,
    });
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });
});
