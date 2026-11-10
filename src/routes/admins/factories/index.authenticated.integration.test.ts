import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Grade } from "../../../drizzle/grades";
import { accounts, adminsDoed, awards, factories } from "../../../drizzle/schema";
import { Role } from "../../../service/authentication";
import { createAwardHistory } from "../../../service/awardHistory";
import { authenticatedRequest, signAccessToken } from "../../../test/authenticated-request";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL });
const db = drizzle(pool);
const awardHistory = createAwardHistory(db);

const ROUTE = "src/routes/admins/factories/index.ts";
const DOED_ID = 99910;
const FACTORY_ID = 99911;
const UNKNOWN_FACTORY_ID = 99912;
const TEST_PROVINCE_ID = 10;
const JSON_CONTENT = { "content-type": "application/json" };

let doedToken: string;

type RawResponse = Awaited<ReturnType<typeof authenticatedRequest>>;

const messageOf = (response: RawResponse) => response.json<{ message: string }>().message;

const approve = (body?: unknown, factoryId = FACTORY_ID, token: string | undefined = doedToken) =>
  authenticatedRequest(ROUTE, {
    method: "PATCH",
    path: `/validate/${factoryId}`,
    token,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : JSON_CONTENT,
  });

const isValidated = async (factoryId = FACTORY_ID) => {
  const [row] = await db
    .select({ isValidate: factories.isValidate })
    .from(factories)
    .where(eq(factories.accountId, factoryId));
  return row?.isValidate;
};

const awardRows = (factoryId = FACTORY_ID) =>
  db
    .select({
      fiscalYear: awards.fiscalYear,
      grade: awards.grade,
      coverId: awards.coverId,
      awardedAt: awards.awardedAt,
    })
    .from(awards)
    .where(eq(awards.factoryId, factoryId))
    .orderBy(awards.fiscalYear);

const yearsAndGrades = async () =>
  (await awardRows()).map(({ fiscalYear, grade, coverId }) => ({ fiscalYear, grade, coverId }));

const seedAward = (fiscalYear: number, grade: Grade) =>
  db.insert(awards).values({ factoryId: FACTORY_ID, fiscalYear, grade });

const expectRefusedAndUntouched = async (response: RawResponse) => {
  expect(response.status).toBe(400);
  expect(await isValidated()).toBe(false);
  expect(await awardRows()).toEqual([]);
};

const removeFixtures = async () => {
  await db.delete(awards).where(eq(awards.factoryId, FACTORY_ID));
  await db.delete(factories).where(eq(factories.accountId, FACTORY_ID));
  await db.delete(adminsDoed).where(eq(adminsDoed.accountId, DOED_ID));
  await db.delete(accounts).where(inArray(accounts.id, [DOED_ID, FACTORY_ID]));
};

const seedPendingFactory = async () => {
  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((rows) => rows[0]);
  await db.insert(accounts).values({
    id: FACTORY_ID,
    username: `test_prior_award_${FACTORY_ID}`,
    password: "hashed",
    email: `test_prior_award_${FACTORY_ID}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: FACTORY_ID,
    factoryType: 1,
    nameTh: `โรงงานทดสอบรางวัลเดิม ${FACTORY_ID}`,
    nameEn: `Test Prior Award Factory ${FACTORY_ID}`,
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: TEST_PROVINCE_ID,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: false,
  });
};

// On its own connection: inside a transaction, pg_stat_activity keeps returning its first snapshot.
const blockedBackends = async () => {
  const { rows } = await pool.query(
    "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
  );
  return rows[0].n as number;
};

const whileBlocking = async <T>(
  blockingSql: { text: string; values: unknown[] },
  requestsParkedOnLock: number,
  send: () => Promise<T>,
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(blockingSql);
    const inFlight = send();
    const deadline = Date.now() + 3_000;
    while ((await blockedBackends()) < requestsParkedOnLock && Date.now() < deadline) {
      await Bun.sleep(25);
    }
    expect(await blockedBackends()).toBe(requestsParkedOnLock);
    await client.query("COMMIT");
    return await inFlight;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const lockFactoryRow = {
  text: 'select 1 from "Factories" where account_id = $1 for update',
  values: [FACTORY_ID],
};

beforeAll(async () => {
  await removeFixtures();
  await db.insert(accounts).values({
    id: DOED_ID,
    username: `test_prior_award_${DOED_ID}`,
    password: "hashed",
    email: `test_prior_award_${DOED_ID}@test.com`,
    role: "DOED",
  });
  await db.insert(adminsDoed).values({
    accountId: DOED_ID,
    firstName: "ทดสอบ",
    lastName: "ทดสอบ",
    phoneNumber: "0000000000",
  });
  doedToken = await signAccessToken({
    id: DOED_ID,
    username: `test_prior_award_${DOED_ID}`,
    role: Role.DOED,
  });
});

beforeEach(async () => {
  await db.delete(awards).where(eq(awards.factoryId, FACTORY_ID));
  await db.delete(factories).where(eq(factories.accountId, FACTORY_ID));
  await db.delete(accounts).where(eq(accounts.id, FACTORY_ID));
  await seedPendingFactory();
});

afterAll(async () => {
  await removeFixtures();
  await pool.end();
});

describe("PATCH /validate/:id, a plain approval", () => {
  const plainApprovals: [string, Parameters<typeof authenticatedRequest>[1]][] = [
    ["no body and no content-type", {}],
    ["no body with a JSON content-type", { headers: JSON_CONTENT }],
    ["an empty object", { body: "{}", headers: JSON_CONTENT }],
    ["an empty awards array", { body: '{"awards":[]}', headers: JSON_CONTENT }],
    [
      "no body with a charset on the content-type",
      { headers: { "content-type": "application/json; charset=utf-8" } },
    ],
  ];

  for (const [name, request] of plainApprovals) {
    it(`approves with ${name} and records nothing`, async () => {
      const response = await authenticatedRequest(ROUTE, {
        method: "PATCH",
        path: `/validate/${FACTORY_ID}`,
        token: doedToken,
        ...request,
      });

      expect(response.status).toBe(200);
      expect(messageOf(response)).toBe("factory validated!");
      expect(await isValidated()).toBe(true);
      expect(await awardRows()).toEqual([]);
    });
  }
});

describe("PATCH /validate/:id, with Prior Awards", () => {
  it("records every sent year with its Grade and no Cover", async () => {
    const response = await approve({
      awards: [
        { fiscalYear: 2023, grade: "gold" },
        { fiscalYear: 2024, grade: "consec-gold" },
        { fiscalYear: 2025, grade: "gold" },
      ],
    });

    expect(response.status).toBe(200);
    expect(messageOf(response)).toBe("factory validated!");
    expect(await isValidated()).toBe(true);
    expect(await yearsAndGrades()).toEqual([
      { fiscalYear: 2023, grade: "gold", coverId: null },
      { fiscalYear: 2024, grade: "consec-gold", coverId: null },
      { fiscalYear: 2025, grade: "gold", coverId: null },
    ]);
  });

  it("records awards sent as JSON without a JSON content-type", async () => {
    const response = await authenticatedRequest(ROUTE, {
      method: "PATCH",
      path: `/validate/${FACTORY_ID}`,
      token: doedToken,
      body: JSON.stringify({ awards: [{ fiscalYear: 2025, grade: "gold" }] }),
      headers: { "content-type": "text/plain" },
    });

    expect(response.status).toBe(200);
    expect(await yearsAndGrades()).toEqual([{ fiscalYear: 2025, grade: "gold", coverId: null }]);
  });
});

describe("PATCH /validate/:id, refused bodies leave the Factory pending", () => {
  const invalid: [string, unknown][] = [
    ["a year below the range", { awards: [{ fiscalYear: 2022, grade: "gold" }] }],
    ["a year above the range", { awards: [{ fiscalYear: 2026, grade: "gold" }] }],
    ["a Buddhist Era year", { awards: [{ fiscalYear: 2568, grade: "gold" }] }],
    ["a non-integer year", { awards: [{ fiscalYear: 2024.5, grade: "gold" }] }],
    ["a Grade below gold", { awards: [{ fiscalYear: 2024, grade: "silver" }] }],
    ["a missing Grade", { awards: [{ fiscalYear: 2024 }] }],
  ];

  for (const [name, body] of invalid) {
    it(`refuses ${name}`, async () => {
      await expectRefusedAndUntouched(await approve(body));
    });
  }

  it("refuses malformed JSON", async () => {
    const response = await authenticatedRequest(ROUTE, {
      method: "PATCH",
      path: `/validate/${FACTORY_ID}`,
      token: doedToken,
      body: "{not json",
      headers: JSON_CONTENT,
    });

    await expectRefusedAndUntouched(response);
  });

  it("refuses a form-encoded body", async () => {
    const response = await authenticatedRequest(ROUTE, {
      method: "PATCH",
      path: `/validate/${FACTORY_ID}`,
      token: doedToken,
      body: "awards=2025",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    await expectRefusedAndUntouched(response);
  });

  it("refuses a year sent twice and names it", async () => {
    const response = await approve({
      awards: [
        { fiscalYear: 2024, grade: "gold" },
        { fiscalYear: 2025, grade: "gold" },
        { fiscalYear: 2024, grade: "consec-gold" },
      ],
    });

    await expectRefusedAndUntouched(response);
    expect(messageOf(response)).toContain("2024");
    expect(messageOf(response)).not.toContain("2025");
  });
});

describe("PATCH /validate/:id, existing Awards rows", () => {
  for (const existingGrade of ["gold", "silver"] as const) {
    it(`refuses a year already holding a ${existingGrade} row and records no other year`, async () => {
      await seedAward(2024, existingGrade);
      const before = await awardRows();

      const response = await approve({
        awards: [
          { fiscalYear: 2023, grade: "gold" },
          { fiscalYear: 2024, grade: "consec-gold" },
          { fiscalYear: 2025, grade: "gold" },
        ],
      });

      expect(response.status).toBe(400);
      expect(messageOf(response)).toContain("2024");
      expect(messageOf(response)).not.toContain("2023");
      expect(messageOf(response)).not.toContain("2025");
      expect(await isValidated()).toBe(false);
      expect(await awardRows()).toEqual(before);
    });
  }

  it("names every conflicting year", async () => {
    await seedAward(2023, "gold");
    await seedAward(2025, "silver");

    const response = await approve({
      awards: [
        { fiscalYear: 2023, grade: "gold" },
        { fiscalYear: 2024, grade: "gold" },
        { fiscalYear: 2025, grade: "gold" },
      ],
    });

    expect(response.status).toBe(400);
    expect(messageOf(response)).toContain("2023");
    expect(messageOf(response)).toContain("2025");
    expect(await isValidated()).toBe(false);
  });

  it("approves when resubmitted without the conflicting year", async () => {
    await seedAward(2024, "gold");
    const refused = await approve({
      awards: [
        { fiscalYear: 2024, grade: "gold" },
        { fiscalYear: 2025, grade: "gold" },
      ],
    });
    expect(refused.status).toBe(400);

    const response = await approve({ awards: [{ fiscalYear: 2025, grade: "gold" }] });

    expect(response.status).toBe(200);
    expect(await isValidated()).toBe(true);
    expect(await yearsAndGrades()).toEqual([
      { fiscalYear: 2024, grade: "gold", coverId: null },
      { fiscalYear: 2025, grade: "gold", coverId: null },
    ]);
  });

  it("refuses when a row for the year commits while the approval is waiting on it", async () => {
    const response = await whileBlocking(
      {
        text: "insert into \"Awards\" (factory_id, fiscal_year, grade) values ($1, 2024, 'silver')",
        values: [FACTORY_ID],
      },
      1,
      () => approve({ awards: [{ fiscalYear: 2024, grade: "gold" }] }),
    );

    expect(response.status).toBe(400);
    expect(messageOf(response)).toContain("2024");
    expect(await isValidated()).toBe(false);
    expect(await yearsAndGrades()).toEqual([{ fiscalYear: 2024, grade: "silver", coverId: null }]);
  });
});

describe("PATCH /validate/:id, existing refusals", () => {
  it("refuses an already validated Factory and records nothing", async () => {
    await db.update(factories).set({ isValidate: true }).where(eq(factories.accountId, FACTORY_ID));

    const response = await approve({ awards: [{ fiscalYear: 2025, grade: "gold" }] });

    expect(response.status).toBe(400);
    expect(messageOf(response)).toBe("factory already validated");
    expect(await awardRows()).toEqual([]);
  });

  it("returns 404 for an unknown Factory and records nothing", async () => {
    const response = await approve(
      { awards: [{ fiscalYear: 2025, grade: "gold" }] },
      UNKNOWN_FACTORY_ID,
    );

    expect(response.status).toBe(404);
    expect(messageOf(response)).toBe("factory not found");
    expect(await awardRows(UNKNOWN_FACTORY_ID)).toEqual([]);
  });
});

describe("PATCH /validate/:id, access", () => {
  for (const role of [Role.Factory, Role.Provincial, Role.Evaluator]) {
    it(`refuses ${role}`, async () => {
      const token = await signAccessToken({ id: FACTORY_ID, username: "not_doed", role });

      const response = await approve(
        { awards: [{ fiscalYear: 2025, grade: "gold" }] },
        FACTORY_ID,
        token,
      );

      expect(response.status).toBe(403);
      expect(await isValidated()).toBe(false);
      expect(await awardRows()).toEqual([]);
    });
  }

  it("refuses an unauthenticated request", async () => {
    const response = await authenticatedRequest(ROUTE, {
      method: "PATCH",
      path: `/validate/${FACTORY_ID}`,
      body: JSON.stringify({ awards: [{ fiscalYear: 2025, grade: "gold" }] }),
      headers: JSON_CONTENT,
    });

    expect(response.status).toBe(401);
    expect(await isValidated()).toBe(false);
    expect(await awardRows()).toEqual([]);
  });
});

describe("PATCH /validate/:id, concurrent approvals", () => {
  it("ends with one success and one refusal, and one row per year", async () => {
    const body = {
      awards: [
        { fiscalYear: 2024, grade: "gold" },
        { fiscalYear: 2025, grade: "gold" },
      ],
    };

    const responses = await whileBlocking(lockFactoryRow, 2, () =>
      Promise.all([approve(body), approve(body)]),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    const refused = responses.find((r) => r.status === 400) as RawResponse;
    expect(messageOf(refused)).toBe("factory already validated");
    expect(await isValidated()).toBe(true);
    expect(await yearsAndGrades()).toEqual([
      { fiscalYear: 2024, grade: "gold", coverId: null },
      { fiscalYear: 2025, grade: "gold", coverId: null },
    ]);
  });

  it("keeps only the winner's awards when two approvals send different ones", async () => {
    const responses = await whileBlocking(lockFactoryRow, 2, () =>
      Promise.all([
        approve({ awards: [{ fiscalYear: 2023, grade: "gold" }] }),
        approve({ awards: [{ fiscalYear: 2025, grade: "consec-gold" }] }),
      ]),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    const rows = await yearsAndGrades();
    expect(rows).toHaveLength(1);
    expect([2023, 2025]).toContain(rows[0]?.fiscalYear as number);
  });
});

describe("what awardHistory answers after approval", () => {
  for (const grade of ["gold", "consec-gold"] as const) {
    it(`a FY2568 ${grade} Prior Award makes 2028 the first eligible year when asked for 2027`, async () => {
      expect((await approve({ awards: [{ fiscalYear: 2025, grade }] })).status).toBe(200);

      expect(await awardHistory.firstEligibleEnrolmentYear(FACTORY_ID, 2027)).toBe(2028);
    });

    it(`a FY2567 ${grade} Prior Award does not bar 2027 and satisfies the 2027 consec-gold lookback`, async () => {
      expect((await approve({ awards: [{ fiscalYear: 2024, grade }] })).status).toBe(200);

      expect(await awardHistory.firstEligibleEnrolmentYear(FACTORY_ID, 2027)).toBeNull();
      expect(await awardHistory.heldGoldTierAtConsecGoldLookback(FACTORY_ID, 2027)).toBe(true);
    });
  }

  it("a plain approval leaves no gold history", async () => {
    expect((await approve()).status).toBe(200);

    expect(await awardHistory.firstEligibleEnrolmentYear(FACTORY_ID, 2027)).toBeNull();
    expect(await awardHistory.heldGoldTierAtConsecGoldLookback(FACTORY_ID, 2027)).toBe(false);
  });
});
