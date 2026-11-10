import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  districts,
  evaluators,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import type { Role } from "../service/authentication";
import {
  authenticatedRequest,
  removeAccount,
  seedEvaluatorAccount,
  signAccessToken,
  type TestIdentity,
} from "../test/authenticated-request";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[location and session response integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const EVALUATOR_ID = 99970;
const FACTORY_ID = 99971;
const EVALUATOR_REGION = 7;

const LOCATION_ROUTE = "src/routes/location/index.ts";
const SESSION_ROUTE = "src/routes/authentication/index.ts";

type SessionBody = {
  id: number;
  username: string;
  role: string;
  change_pw: boolean;
  eval_level: string | null;
  region: number | null;
  full_name: string;
};

const sessionOf = async (identity: TestIdentity) => {
  const res = await authenticatedRequest(SESSION_ROUTE, {
    token: await signAccessToken(identity),
    path: "/",
  });
  expect(res.status).toBe(200);
  return res.json<SessionBody>();
};

const seededAccountOfRole = async (role: "DOED" | "Provincial"): Promise<TestIdentity> => {
  const row = await db
    .select({ id: accounts.id, username: accounts.username })
    .from(accounts)
    .where(eq(accounts.role, role))
    .orderBy(asc(accounts.id))
    .limit(1)
    .then((r) => r[0]);
  if (!row) throw new Error(`no ${role} account seeded`);
  return { ...row, role: role as Role };
};

const seedFactoryAccount = async (accountId: number): Promise<TestIdentity> => {
  const geo = await db
    .select({ provinceId: districts.provinceId, districtId: districts.districtId })
    .from(districts)
    .orderBy(asc(districts.districtId))
    .limit(1)
    .then((r) => r[0]);
  if (!geo) throw new Error("no district seeded");
  const subdistrict = await db
    .select({ subdistrictId: subdistricts.subdistrictId })
    .from(subdistricts)
    .where(eq(subdistricts.districtId, geo.districtId))
    .orderBy(asc(subdistricts.subdistrictId))
    .limit(1)
    .then((r) => r[0]);
  if (!subdistrict) throw new Error("no subdistrict seeded");
  const username = `test_auth_factory_${accountId}`;
  await db.insert(accounts).values({
    id: accountId,
    username,
    password: "hashed",
    email: `${username}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ session",
    nameEn: "Test Session Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: geo.provinceId,
    districtId: geo.districtId,
    subdistrictId: subdistrict.subdistrictId,
    isValidate: true,
  });
  return { id: accountId, username, role: "Factory" as Role };
};

const cleanup = async () => {
  await db.delete(evaluators).where(eq(evaluators.accountId, EVALUATOR_ID));
  await db.delete(factories).where(eq(factories.accountId, FACTORY_ID));
  await removeAccount(db, EVALUATOR_ID);
  await removeAccount(db, FACTORY_ID);
};

describeDb("GET /provinces response", () => {
  it("returns a numeric health_region on every row alongside name_th and province_id", async () => {
    const res = await authenticatedRequest(LOCATION_ROUTE, { path: "/provinces" });
    expect(res.status).toBe(200);
    const rows = res.json<{ name_th: string; province_id: number; health_region: number }[]>();

    const stored = await db
      .select({
        provinceId: provinces.provinceId,
        nameTh: provinces.nameTh,
        healthRegion: provinces.healthRegion,
      })
      .from(provinces);

    expect(rows.length).toBe(stored.length);
    for (const row of rows) {
      expect(typeof row.health_region).toBe("number");
      expect(typeof row.name_th).toBe("string");
      expect(typeof row.province_id).toBe("number");
    }
    for (const province of stored) {
      const row = rows.find((r) => r.province_id === province.provinceId);
      expect(row).toBeDefined();
      expect(row?.health_region).toBe(province.healthRegion);
      expect(row?.name_th).toBe(province.nameTh);
    }
  });
});

describeDb("GET session response", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it("returns an Evaluator's own region", async () => {
    const identity = await seedEvaluatorAccount(db, {
      id: EVALUATOR_ID,
      region: EVALUATOR_REGION,
    });
    const body = await sessionOf(identity);
    expect(body.region).toBe(EVALUATOR_REGION);
    expect(body.role).toBe("Evaluator");
    expect(body.id).toBe(EVALUATOR_ID);
    expect(body.username).toBe(identity.username);
    expect(body.eval_level).toBe("ODPC");
  });

  it("returns region null for a DOED account and keeps the existing fields", async () => {
    const identity = await seededAccountOfRole("DOED");
    const body = await sessionOf(identity);
    expect(body.region).toBeNull();
    expect(body.role).toBe("DOED");
    expect(body.id).toBe(identity.id);
    expect(body.username).toBe(identity.username);
    expect(typeof body.full_name).toBe("string");
    expect(typeof body.change_pw).toBe("boolean");
  });

  it("returns region null for a Provincial Officer and keeps the existing fields", async () => {
    const identity = await seededAccountOfRole("Provincial");
    const body = await sessionOf(identity);
    expect(body.region).toBeNull();
    expect(body.role).toBe("Provincial");
    expect(body.id).toBe(identity.id);
    expect(body.username).toBe(identity.username);
    expect(typeof body.full_name).toBe("string");
  });

  it("returns region null for a Factory and keeps the existing fields", async () => {
    const identity = await seedFactoryAccount(FACTORY_ID);
    const body = await sessionOf(identity);
    expect(body.region).toBeNull();
    expect(body.role).toBe("Factory");
    expect(body.id).toBe(FACTORY_ID);
    expect(body.full_name).toBe("โรงงานทดสอบ session");
  });
});
