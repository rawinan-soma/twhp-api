import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { openapi } from "@elysiajs/openapi";
import { eq, inArray, or } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Elysia } from "elysia";
import { Pool } from "pg";
import {
  accounts,
  adminsDoed,
  awards,
  enrolls,
  evaluators,
  factories,
  provincialOfficers,
} from "../../../drizzle/schema";
import { Role } from "../../../service/authentication";
import {
  authenticatedRequest,
  removeProvincialOfficerAccount,
  seedAdminAccount,
  seedEvaluatorAccount,
  seedProvincialOfficerAccount,
  signAccessToken,
  type TestIdentity,
} from "../../../test/authenticated-request";
import { seedEnrollWithCover, seedFactoryInProvince } from "../../../test/staff-list-fixtures";
import factoryRoute from "./[id]";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL });
const db = drizzle(pool);

const ROUTE = "src/routes/admins/factories/[id].ts";
const REGISTER_ROUTE = "src/routes/factories/index.ts";
const DOED_ID = 99920;
const EVALUATOR_ID = 99921;
const OFFICER_ID = 99922;
const FACTORY_ID = 99923;
const UNKNOWN_ID = 99924;
const STAFF_IDS = [DOED_ID, EVALUATOR_ID, OFFICER_ID];
const ALL_IDS = [...STAFF_IDS, FACTORY_ID];
const PROVINCE_ID = 10;
const SUBDISTRICT_ID = 100101;
const GEO = { districtId: 1001, subdistrictId: SUBDISTRICT_ID };
const USERNAME = `test_staff_list_${FACTORY_ID}`;
const EMAIL = `${USERNAME}@test.com`;

let doed: TestIdentity;
let evaluator: TestIdentity;
let officer: TestIdentity;
let doedToken: string;

const sendDelete = (id: number, token: string | undefined = doedToken) =>
  authenticatedRequest(ROUTE, {
    method: "DELETE",
    path: `/${id}`,
    mountAt: "/:id",
    token,
  });

const messageOf = (response: Awaited<ReturnType<typeof sendDelete>>) =>
  response.json<{ message: string }>().message;

const seedFactory = (isValidate: boolean) =>
  seedFactoryInProvince(db, FACTORY_ID, PROVINCE_ID, GEO, { isValidate });

const award = { factoryId: FACTORY_ID, fiscalYear: 2025, grade: "gold" as const };

const seedEnroll = (database: NodePgDatabase) =>
  seedEnrollWithCover(database, FACTORY_ID, new Date().toISOString(), "none");

const rowCounts = async (id = FACTORY_ID) => ({
  accounts: (await db.select().from(accounts).where(eq(accounts.id, id))).length,
  factories: (await db.select().from(factories).where(eq(factories.accountId, id))).length,
  awards: (await db.select().from(awards).where(eq(awards.factoryId, id))).length,
  enrolls: (await db.select().from(enrolls).where(eq(enrolls.factoryId, id))).length,
});

const removeFactoryFixtures = async () => {
  await db.delete(awards).where(eq(awards.factoryId, FACTORY_ID));
  await db.delete(enrolls).where(eq(enrolls.factoryId, FACTORY_ID));
  await db.delete(accounts).where(or(eq(accounts.username, USERNAME), eq(accounts.email, EMAIL)));
};

const removeAllFixtures = async () => {
  await removeFactoryFixtures();
  await removeProvincialOfficerAccount(db, OFFICER_ID);
  await db.delete(accounts).where(inArray(accounts.id, ALL_IDS));
};

// On its own connection: inside a transaction, pg_stat_activity keeps returning its first snapshot.
const blockedBackends = async () => {
  const { rows } = await pool.query(
    "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
  );
  return rows[0].n as number;
};

beforeAll(async () => {
  await removeAllFixtures();
  doed = await seedAdminAccount(db, { id: DOED_ID });
  await db.insert(adminsDoed).values({
    accountId: DOED_ID,
    firstName: "ทดสอบ",
    lastName: "ทดสอบ",
    phoneNumber: "0000000000",
  });
  evaluator = await seedEvaluatorAccount(db, { id: EVALUATOR_ID, region: 1 });
  officer = await seedProvincialOfficerAccount(db, { id: OFFICER_ID, provinceId: PROVINCE_ID });
  doedToken = await signAccessToken(doed);
});

beforeEach(removeFactoryFixtures);

afterAll(async () => {
  await removeAllFixtures();
  await pool.end();
});

describe("DELETE /admins/factories/:id", () => {
  it("refuses a Factory that holds an Award and changes nothing", async () => {
    await seedFactory(true);
    await db.insert(awards).values(award);

    const response = await sendDelete(FACTORY_ID);

    expect(response.status).toBe(400);
    expect(messageOf(response)).toContain("awards");
    expect(await rowCounts()).toEqual({ accounts: 1, factories: 1, awards: 1, enrolls: 0 });
  });

  it("refuses a Factory that holds an Enroll and no Award and changes nothing", async () => {
    await seedFactory(true);
    await seedEnroll(db);

    const response = await sendDelete(FACTORY_ID);

    expect(response.status).toBe(400);
    expect(messageOf(response)).toContain("enrolls");
    expect(await rowCounts()).toEqual({ accounts: 1, factories: 1, awards: 0, enrolls: 1 });
  });

  it.each([
    ["approved", true],
    ["pending", false],
  ])("removes a Factory with no history (%s), and its username can register again", async (_, isValidate) => {
    await seedFactory(isValidate);

    const response = await sendDelete(FACTORY_ID);

    expect(response.status).toBe(200);
    expect(await rowCounts()).toEqual({ accounts: 0, factories: 0, awards: 0, enrolls: 0 });

    const registered = await authenticatedRequest(REGISTER_ROUTE, {
      method: "POST",
      path: "/register",
      body: {
        factoryType: 1,
        nameTh: "โรงงานลงทะเบียนใหม่",
        nameEn: "Registered Again",
        tsicCode: "1011",
        addressNo: "1",
        zipcode: "10000",
        phoneNumber: "0000000000",
        subdistrictId: SUBDISTRICT_ID,
        username: USERNAME,
        password: "password",
        email: EMAIL,
      },
    });

    expect(registered.status).toBe(200);
    const [account] = await db.select().from(accounts).where(eq(accounts.username, USERNAME));
    expect(account?.email).toBe(EMAIL);
  });

  it("returns 404 on a repeat delete", async () => {
    await seedFactory(true);
    expect((await sendDelete(FACTORY_ID)).status).toBe(200);

    const response = await sendDelete(FACTORY_ID);

    expect(response.status).toBe(404);
    expect(messageOf(response)).toBe("factory not found");
  });

  it("returns 404 for an unknown id", async () => {
    const response = await sendDelete(UNKNOWN_ID);

    expect(response.status).toBe(404);
    expect(messageOf(response)).toBe("factory not found");
  });

  it("returns 404 for an orphaned Account that has no Factories row", async () => {
    await seedFactory(true);
    await db.delete(factories).where(eq(factories.accountId, FACTORY_ID));

    const response = await sendDelete(FACTORY_ID);

    expect(response.status).toBe(404);
    expect(await rowCounts()).toEqual({ accounts: 1, factories: 0, awards: 0, enrolls: 0 });
  });

  const roleRow = {
    DOED: () => db.select().from(adminsDoed).where(eq(adminsDoed.accountId, DOED_ID)),
    Evaluator: () => db.select().from(evaluators).where(eq(evaluators.accountId, EVALUATOR_ID)),
    Provincial: () =>
      db.select().from(provincialOfficers).where(eq(provincialOfficers.accountId, OFFICER_ID)),
  };

  it.each([
    ["Evaluator", EVALUATOR_ID],
    ["Provincial", OFFICER_ID],
    ["DOED", DOED_ID],
  ] as const)("returns 404 for a staff account id (%s) and leaves it in place", async (role, id) => {
    const response = await sendDelete(id);

    expect(response.status).toBe(404);
    expect(messageOf(response)).toBe("factory not found");
    expect((await rowCounts(id)).accounts).toBe(1);
    expect(await roleRow[role]()).toHaveLength(1);
  });

  it.each([
    [
      "Award",
      "awards",
      (client: NodePgDatabase) => client.insert(awards).values(award),
      { awards: 1, enrolls: 0 },
    ],
    ["Enroll", "enrolls", seedEnroll, { awards: 0, enrolls: 1 }],
  ] as const)("gives 400 when a new row (%s) commits while the delete waits on it", async (_, reason, insert, held) => {
    await seedFactory(true);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insert(drizzle(client));
      const inFlight = sendDelete(FACTORY_ID);
      const deadline = Date.now() + 5_000;
      while ((await blockedBackends()) < 1 && Date.now() < deadline) {
        await Bun.sleep(25);
      }
      expect(await blockedBackends()).toBe(1);
      await client.query("COMMIT");

      const response = await inFlight;

      expect(response.status).toBe(400);
      expect(messageOf(response)).toContain(reason);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    expect(await rowCounts()).toEqual({ accounts: 1, factories: 1, ...held });
  });

  it("lists the 400 in the OpenAPI document", async () => {
    const app = new Elysia()
      .use(openapi({ path: "document" }))
      .use(new Elysia({ prefix: "/admins/factories/:id" }).use(factoryRoute));

    const response = await app.handle(new Request("http://localhost/document/json"));
    const { paths } = (await response.json()) as {
      paths: Record<string, { delete: { responses: Record<string, unknown> } }>;
    };

    expect(Object.keys(paths["/admins/factories/{id}"]!.delete.responses)).toContain("400");
  });

  it("answers 401 to an anonymous caller and leaves the Factory in place", async () => {
    await seedFactory(true);

    const response = await authenticatedRequest(ROUTE, {
      method: "DELETE",
      path: `/${FACTORY_ID}`,
      mountAt: "/:id",
    });

    expect(response.status).toBe(401);
    expect((await rowCounts()).factories).toBe(1);
  });

  it.each([
    ["Factory", () => ({ id: FACTORY_ID, username: USERNAME, role: Role.Factory })],
    ["Evaluator", () => evaluator],
    ["Provincial", () => officer],
  ] as const)("answers 403 to a non-DOED caller (%s) and leaves the Factory in place", async (_, identity) => {
    await seedFactory(true);

    const response = await sendDelete(FACTORY_ID, await signAccessToken(identity()));

    expect(response.status).toBe(403);
    expect((await rowCounts()).factories).toBe(1);
  });
});
