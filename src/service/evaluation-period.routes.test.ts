import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { createEnrollService } from "./enroll";
import { createEvaluatorReviewHelper } from "./evaluator-review";
import { createFactoryService } from "./factory";
import { createScoreService } from "./score";

/**
 * Isolated wiring tests for the evaluation period. A stubbed pg client records every query's
 * parameters and returns no rows, so nothing touches a database.
 */

const bkk = (isoWallClock: string) => new Date(`${isoWallClock}+07:00`);

afterEach(() => {
  setSystemTime();
});

const recorder = (rows: unknown[] = []) => {
  const params: unknown[] = [];
  const client = {
    query: async (_config: { rowMode?: string }, values?: unknown[]) => {
      params.push(...(values ?? []));
      return { rows, rowCount: rows.length, fields: [] };
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: a stub client is all the driver needs here
  const database = drizzle({ client: client as any });
  return { database, params };
};

const iso = (wallClock: string) => bkk(wallClock).toISOString();
const FY2026_START = iso("2025-10-01T00:00:00.000");
const FY2027_END = iso("2027-10-01T00:00:00.000");

describe("staff list default year", () => {
  const lists: [string, (db: ReturnType<typeof recorder>["database"]) => Promise<unknown>][] = [
    ["enrolls", (db) => createEnrollService(db).getAllEnrolls()],
    ["score", (db) => createScoreService(db).getAllScores()],
    [
      "factories",
      (db) => createFactoryService(db).getAllFactories({ validated: true, enrolled: true }),
    ],
  ];

  for (const [name, run] of lists) {
    it(`${name}: prior year during 1-31 Oct`, async () => {
      setSystemTime(bkk("2026-10-20T12:00:00.000"));
      const { database, params } = recorder();
      await run(database);
      expect(params).toContain(FY2026_START);
      expect(params).not.toContain(FY2027_END);
    });

    it(`${name}: current year from 1 Nov`, async () => {
      setSystemTime(bkk("2026-11-01T00:00:00.000"));
      const { database, params } = recorder();
      await run(database);
      expect(params).toContain(FY2027_END);
      expect(params).not.toContain(FY2026_START);
    });
  }
});

describe("assertYearWritable during the evaluation period", () => {
  const priorYearCover = () => recorder([[iso("2026-03-01T12:00:00.000")]]); // enrollDate in FY2026, array row mode

  const reviewer = (level: "Mental" | "DOH" | "ODPC") =>
    ({ accountId: 1, level, scope: { kind: "region", region: 1 } }) as never;

  it("admits Mental and DOH through 31 Oct", async () => {
    setSystemTime(bkk("2026-10-31T23:59:59.999"));
    const { database } = priorYearCover();
    const helper = createEvaluatorReviewHelper(database);
    expect(await helper.assertYearWritable(1, reviewer("Mental"))).toBeNull();
    expect(await helper.assertYearWritable(1, reviewer("DOH"))).toBeNull();
  });

  it("refuses Mental and DOH from 1 Nov but still admits ODPC", async () => {
    setSystemTime(bkk("2026-11-01T00:00:00.000"));
    const { database } = priorYearCover();
    const helper = createEvaluatorReviewHelper(database);
    expect(await helper.assertYearWritable(1, reviewer("Mental"))).toBeInstanceOf(
      ElysiaCustomStatusResponse,
    );
    expect(await helper.assertYearWritable(1, reviewer("DOH"))).toBeInstanceOf(
      ElysiaCustomStatusResponse,
    );
    expect(await helper.assertYearWritable(1, reviewer("ODPC"))).toBeNull();
  });
});
