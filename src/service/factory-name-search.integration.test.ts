import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { answers, awards, questions } from "../drizzle/schema";
import {
  authenticatedGet,
  removeAccount,
  removeProvincialOfficerAccount,
  seedAdminAccount,
  seedEvaluatorAccount,
  seedProvincialOfficerAccount,
  signAccessToken,
} from "../test/authenticated-request";
import {
  type CoverState,
  geoOf,
  pickRegionLayout,
  type RegionLayout,
  removeFactoryWithCovers,
  seedEnrollWithCover,
  seedFactoryInProvince,
} from "../test/staff-list-fixtures";
import { utilities } from "../utils";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[factory-name-search.integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const VALIDATION_STATUS_WITHOUT_ROOT_ERROR_HANDLER = 422;

const BASE = 99700;
const ADMIN_ID = BASE;
const EVALUATOR_ID = BASE + 1;
const OFFICER_ID = BASE + 2;

const F = {
  named: BASE + 10,
  percent: BASE + 11,
  percentDecoy: BASE + 12,
  underscore: BASE + 13,
  underscoreDecoy: BASE + 14,
  backslash: BASE + 15,
  backslashDecoy: BASE + 16,
  long: BASE + 17,
  page1: BASE + 18,
  page2: BASE + 19,
  page3: BASE + 20,
  scopeHome: BASE + 21,
  scopeSibling: BASE + 22,
  scopeOutside: BASE + 23,
  neverEnrolled: BASE + 24,
  unvalidated: BASE + 25,
  pastYear: BASE + 26,
  statusReview: BASE + 27,
  statusProgress: BASE + 28,
  graded: BASE + 29,
} as const;

const GRADED_ANSWER_COUNT = 3;
const LONG_TERM = `Zqlong${"a".repeat(94)}`;

type Place = "home" | "sibling" | "outside";
type Fixture = {
  id: number;
  nameTh?: string;
  nameEn?: string;
  place?: Place;
  enrollment?: "current" | "past" | "never";
  cover?: CoverState;
  isValidate?: boolean;
};

const FIXTURES: Fixture[] = [
  { id: F.named, nameTh: "บริษัท พลอยทับทิมซีคิว มอเตอร์ จำกัด", nameEn: "Zqsapphire Motors Company" },
  { id: F.percent, nameEn: "Zqwild 50%off" },
  { id: F.percentDecoy, nameEn: "Zqwild 50Xoff" },
  { id: F.underscore, nameEn: "Zqwild a_b" },
  { id: F.underscoreDecoy, nameEn: "Zqwild aXb" },
  { id: F.backslash, nameEn: "Zqwild c\\d" },
  { id: F.backslashDecoy, nameEn: "Zqwild cd" },
  { id: F.long, nameEn: LONG_TERM },
  { id: F.page1, nameEn: "Zqpage one" },
  { id: F.page2, nameEn: "Zqpage two" },
  { id: F.page3, nameEn: "Zqpage three" },
  { id: F.scopeHome, nameEn: "Zqscope home" },
  { id: F.scopeSibling, nameEn: "Zqscope sibling", place: "sibling" },
  { id: F.scopeOutside, nameEn: "Zqscope outside", place: "outside" },
  { id: F.neverEnrolled, nameEn: "Zqnever enrolled", enrollment: "never" },
  { id: F.unvalidated, nameEn: "Zqunvalidated", isValidate: false },
  { id: F.pastYear, nameEn: "Zqpastyear", enrollment: "past" },
  { id: F.statusReview, nameEn: "Zqstatus review" },
  { id: F.statusProgress, nameEn: "Zqstatus progress", cover: "in_progress" },
  { id: F.graded, nameEn: "Zqgraded", cover: "finished" },
];

type Caller = "admin" | "evaluator" | "officer";
type Query = Record<string, string | number | boolean | undefined>;
type Expectation = { query: Query; expected: number[] };

type ListKind = {
  requiredQuery: Query;
  factoryIdField: string;
  byListOrder: (ascendingIds: number[]) => number[];
  findsNeverEnrolled: (caller: Caller) => boolean;
  filterCases: () => Expectation[];
};

let layout: RegionLayout;
let lastFiscalYear: number;
const tokens = {} as Record<Caller, string>;

const factoryList: ListKind = {
  requiredQuery: { validated: true },
  factoryIdField: "account_id",
  byListOrder: (ids) => ids,
  findsNeverEnrolled: (caller) => caller === "admin",
  filterCases: () => [
    { query: { search: "Zqunvalidated" }, expected: [] },
    { query: { search: "Zqunvalidated", validated: false }, expected: [F.unvalidated] },
    { query: { search: "Zqpastyear", enrolled: true }, expected: [] },
    {
      query: { search: "Zqpastyear", enrolled: true, fiscalYear: lastFiscalYear },
      expected: [F.pastYear],
    },
    { query: { search: "Zqpastyear", enrolled: false }, expected: [F.pastYear] },
  ],
};

const enrollList: ListKind = {
  requiredQuery: {},
  factoryIdField: "factoryId",
  byListOrder: (ids) => [...ids].reverse(),
  findsNeverEnrolled: () => false,
  filterCases: () => [
    { query: { search: "Zqstatus" }, expected: [F.statusReview, F.statusProgress] },
    { query: { search: "Zqstatus", coverStatus: "in_review" }, expected: [F.statusReview] },
    { query: { search: "Zqstatus", coverStatus: "in_progress" }, expected: [F.statusProgress] },
    { query: { search: "Zqpastyear" }, expected: [] },
    { query: { search: "Zqpastyear", fiscalYear: lastFiscalYear }, expected: [F.pastYear] },
  ],
};

const scoreList: ListKind = {
  requiredQuery: {},
  factoryIdField: "factoryId",
  byListOrder: (ids) => ids,
  findsNeverEnrolled: () => false,
  filterCases: () => [
    { query: { search: "Zqstatus" }, expected: [F.statusReview] },
    { query: { search: "Zqpastyear" }, expected: [] },
    { query: { search: "Zqpastyear", fiscalYear: lastFiscalYear }, expected: [F.pastYear] },
  ],
};

type SearchRoute = { name: string; module: string; caller: Caller; list: ListKind };

const ROUTES: SearchRoute[] = [
  {
    name: "admins/factories",
    module: "src/routes/admins/factories/index.ts",
    caller: "admin",
    list: factoryList,
  },
  {
    name: "evaluators/factories",
    module: "src/routes/evaluators/factories/index.ts",
    caller: "evaluator",
    list: factoryList,
  },
  {
    name: "provincialOfficers/factories",
    module: "src/routes/provincialOfficers/factories/index.ts",
    caller: "officer",
    list: factoryList,
  },
  {
    name: "admins/enrolls",
    module: "src/routes/admins/enrolls/index.ts",
    caller: "admin",
    list: enrollList,
  },
  {
    name: "evaluators/enrolls",
    module: "src/routes/evaluators/enrolls/index.ts",
    caller: "evaluator",
    list: enrollList,
  },
  {
    name: "provincialOfficers/enrolls",
    module: "src/routes/provincialOfficers/enrolls/index.ts",
    caller: "officer",
    list: enrollList,
  },
  {
    name: "admins/score",
    module: "src/routes/admins/score/index.ts",
    caller: "admin",
    list: scoreList,
  },
  {
    name: "evaluators/score",
    module: "src/routes/evaluators/score/index.ts",
    caller: "evaluator",
    list: scoreList,
  },
  {
    name: "provincialOfficers/score",
    module: "src/routes/provincialOfficers/score/index.ts",
    caller: "officer",
    list: scoreList,
  },
];

const scopeCases: Record<Caller, () => { visible: number[]; cases: Expectation[] }> = {
  admin: () => ({
    visible: [F.scopeHome, F.scopeSibling, F.scopeOutside],
    cases: [
      { query: { region: layout.region }, expected: [F.scopeHome, F.scopeSibling] },
      { query: { region: layout.outOfRegionRegion }, expected: [F.scopeOutside] },
      { query: { provinceId: layout.otherProvinceInRegion }, expected: [F.scopeSibling] },
    ],
  }),
  evaluator: () => ({
    visible: [F.scopeHome, F.scopeSibling],
    cases: [
      { query: { provinceId: layout.otherProvinceInRegion }, expected: [F.scopeSibling] },
      { query: { provinceId: layout.provinceOutOfRegion }, expected: [] },
      { query: { region: layout.outOfRegionRegion }, expected: [F.scopeHome, F.scopeSibling] },
    ],
  }),
  officer: () => ({
    visible: [F.scopeHome],
    cases: [
      { query: { provinceId: layout.provinceOutOfRegion }, expected: [F.scopeHome] },
      { query: { region: layout.outOfRegionRegion }, expected: [F.scopeHome] },
    ],
  }),
};

type ListBody = {
  items: Array<Record<string, unknown>>;
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const list = async (route: SearchRoute, query: Query) => {
  const response = await authenticatedGet(route.module, {
    token: tokens[route.caller],
    query: { ...route.list.requiredQuery, ...query },
  });
  return { status: response.status, body: response.json<ListBody>() };
};

const found = async (route: SearchRoute, query: Query) => {
  const { status, body } = await list(route, query);
  expect(status).toBe(200);
  return {
    ids: body.items.map((row) => row[route.list.factoryIdField] as number),
    items: body.items,
    meta: body.meta,
  };
};

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

const expectExactly = async (route: SearchRoute, query: Query, expected: number[]) => {
  const { ids, meta } = await found(route, query);
  expect(sorted(ids)).toEqual(sorted(expected));
  expect(meta.total).toBe(expected.length);
};

const cleanup = async () => {
  for (const { id } of FIXTURES) await removeFactoryWithCovers(db, id);
  await removeAccount(db, ADMIN_ID);
  await removeAccount(db, EVALUATOR_ID);
  await removeProvincialOfficerAccount(db, OFFICER_ID);
};

beforeAll(async () => {
  if (!dbReachable) return;
  layout = await pickRegionLayout(db);
  const { fiscalYear, fiscalYearStart } = utilities().getReviewerFiscalYear();
  lastFiscalYear = fiscalYear - 1;
  const lastYearStart = utilities().getFiscalYear(lastFiscalYear).fiscalYearStart;

  await cleanup();

  tokens.admin = await signAccessToken(await seedAdminAccount(db, { id: ADMIN_ID }));
  tokens.evaluator = await signAccessToken(
    await seedEvaluatorAccount(db, { id: EVALUATOR_ID, region: layout.region }),
  );
  tokens.officer = await signAccessToken(
    await seedProvincialOfficerAccount(db, {
      id: OFFICER_ID,
      provinceId: layout.provinceInRegion,
    }),
  );

  const provinceOf: Record<Place, number> = {
    home: layout.provinceInRegion,
    sibling: layout.otherProvinceInRegion,
    outside: layout.provinceOutOfRegion,
  };
  const geoByPlace = {
    home: await geoOf(db, provinceOf.home),
    sibling: await geoOf(db, provinceOf.sibling),
    outside: await geoOf(db, provinceOf.outside),
  };

  for (const fixture of FIXTURES) {
    const place = fixture.place ?? "home";
    await seedFactoryInProvince(db, fixture.id, provinceOf[place], geoByPlace[place], {
      nameTh: fixture.nameTh ?? "โรงงานทดสอบการค้นหา",
      nameEn: fixture.nameEn,
      isValidate: fixture.isValidate ?? true,
    });
    const enrollment = fixture.enrollment ?? "current";
    if (enrollment === "never") continue;
    const start = enrollment === "past" ? lastYearStart : fiscalYearStart;
    const coverId = await seedEnrollWithCover(
      db,
      fixture.id,
      start.toISOString(),
      fixture.cover ?? "in_review",
    );
    if (fixture.id === F.graded && coverId !== undefined) {
      const scoredQuestions = await db
        .select({ id: questions.id })
        .from(questions)
        .orderBy(asc(questions.id))
        .limit(GRADED_ANSWER_COUNT);
      await db.insert(answers).values(
        scoredQuestions.map(({ id }) => ({
          questionId: id,
          coverId,
          selectedChoice: "2" as const,
        })),
      );
      await db.insert(awards).values({ factoryId: fixture.id, fiscalYear, grade: "gold", coverId });
    }
  }
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await pool.end().catch(() => {});
});

for (const route of ROUTES) {
  describeDb(`Factory Name Search on ${route.name}`, () => {
    it("finds a factory by a fragment from the middle of its Thai name", async () => {
      await expectExactly(route, { search: "พลอยทับทิมซีคิว" }, [F.named]);
    });

    it("finds a factory by an English fragment in any letter case", async () => {
      await expectExactly(route, { search: "zQsAPPHIRE" }, [F.named]);
    });

    it("matches the whole term rather than its separate words", async () => {
      await expectExactly(route, { search: "Motors Zqsapphire" }, []);
    });

    it("returns an empty page with total 0 for a non-matching term", async () => {
      const { ids, meta } = await found(route, { search: "Zqnosuchfactory" });
      expect(ids).toEqual([]);
      expect(meta.total).toBe(0);
      expect(meta.totalPages).toBe(0);
    });

    it("treats % as a literal character", async () => {
      await expectExactly(route, { search: "50%off" }, [F.percent]);
    });

    it("treats _ as a literal character", async () => {
      await expectExactly(route, { search: "a_b" }, [F.underscore]);
    });

    it("treats a backslash as a literal character", async () => {
      await expectExactly(route, { search: "c\\d" }, [F.backslash]);
    });

    it("applies no filter for a blank or whitespace-only term", async () => {
      const baseline = await found(route, {});
      expect(baseline.meta.total).toBeGreaterThan(0);
      for (const search of ["", "   "]) {
        const { ids, meta } = await found(route, { search });
        expect(ids).toEqual(baseline.ids);
        expect(meta).toEqual(baseline.meta);
      }
    });

    it("ignores spaces around the term", async () => {
      await expectExactly(route, { search: "  Zqsapphire  " }, [F.named]);
    });

    it("accepts a 100-character term and searches with all of it", async () => {
      await expectExactly(route, { search: LONG_TERM }, [F.long]);
    });

    it("rejects a term over 100 characters, measured before trimming", async () => {
      for (const search of ["z".repeat(101), `${LONG_TERM} `]) {
        const { status } = await list(route, { search });
        expect(status).toBe(VALIDATION_STATUS_WITHOUT_ROOT_ERROR_HANDLER);
      }
    });

    it("counts only matches and keeps the list's order across pages", async () => {
      const ordered = route.list.byListOrder([F.page1, F.page2, F.page3]);
      const first = await found(route, { search: "Zqpage", limit: 2 });
      expect(first.ids).toEqual(ordered.slice(0, 2));
      expect(first.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      const second = await found(route, { search: "Zqpage", limit: 2, page: 2 });
      expect(second.ids).toEqual(ordered.slice(2));
      expect(second.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    });

    it("combines with the list's own filters", async () => {
      for (const { query, expected } of route.list.filterCases()) {
        await expectExactly(route, query, expected);
      }
    });

    it("stays inside the caller's scope, whatever the request supplies", async () => {
      const { visible, cases } = scopeCases[route.caller]();
      await expectExactly(route, { search: "Zqscope" }, visible);
      for (const { query, expected } of cases) {
        await expectExactly(route, { search: "Zqscope", ...query }, expected);
      }
    });

    it("finds a never-enrolled factory only where the list shows one", async () => {
      await expectExactly(
        route,
        { search: "Zqnever" },
        route.list.findsNeverEnrolled(route.caller) ? [F.neverEnrolled] : [],
      );
    });
  });
}

for (const route of ROUTES.filter(({ list }) => list === scoreList)) {
  describeDb(`Factory Name Search on ${route.name} Score Reports`, () => {
    it("keeps a matched report's answers and grade", async () => {
      const { items } = await found(route, { search: "Zqgraded" });
      const unfiltered = await found(route, { limit: 100 });
      const unfilteredReport = unfiltered.items.find((row) => row.factoryId === F.graded);
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(unfilteredReport as Record<string, unknown>);
      expect(items[0].grade).toBe("gold");
      expect((items[0].scoring as { total: { scoredCount: number } }).total.scoredCount).toBe(
        GRADED_ANSWER_COUNT,
      );
    });
  });
}
