import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { eq, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  evaluators,
  invitations,
  provinces,
  provincialOfficers,
} from "../drizzle/schema";
import type { StaffEntry } from "../schema/staff";
import { authenticatedRequest, signAccessToken } from "../test/authenticated-request";
import { Role } from "./authentication";

setDefaultTimeout(30_000);

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[staff integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const STAFF_ROUTE = "src/routes/admins/staff/index.ts";
const INVITATIONS_ROUTE = "src/routes/admins/invitations/index.ts";
const AUTHENTICATION_ROUTE = "src/routes/authentication/index.ts";

const ADMIN_ID = 99520;
const PREFIX = "staff54-";
const PASSWORD_HASH = "staff54-password-hash-sentinel";
const REFRESH_HASH = "staff54-refresh-hash-sentinel";
const TOKEN_HASH = "staff54-token-hash";
const HOUR = 3_600_000;

const INVITATION = { eval: 99524, provExpired: 99523, evalExpired: 99522, prov: 99521 };
const ACCOUNT = { evalLow: 99521, provLow: 99522, evalHigh: 99523, provHigh: 99524 };
const ACCOUNT_IDS = Object.values(ACCOUNT);

const emailOf = (name: string) => `${PREFIX}${name}@test.com`;
const newEmail = () => emailOf(crypto.randomUUID());

let adminToken: string;
let province: { provinceId: number; nameTh: string; healthRegion: number };
let seededAccountIds: number[];

const listStaff = async () => {
  const response = await authenticatedRequest(STAFF_ROUTE, { token: adminToken });
  expect(response.status).toBe(200);
  return { body: response.body, entries: response.json<StaffEntry[]>() };
};

const invite = async (email: string) => {
  const response = await authenticatedRequest(INVITATIONS_ROUTE, {
    method: "POST",
    token: adminToken,
    body: {
      role: "Evaluator",
      email,
      firstName: "เชิญ",
      lastName: "ทางอีเมล",
      phoneNumber: "0811111111",
      level: "DOH",
      region: province.healthRegion,
    },
  });
  expect(response.status).toBe(201);
  return {
    id: response.json<{ id: number }>().id,
    token: response.queuedEmails[0]?.data.token as string,
  };
};

const accept = (token: string) =>
  authenticatedRequest(AUTHENTICATION_ROUTE, {
    method: "POST",
    path: "/accept-invitation",
    body: { token, password: "chosen-by-the-invitee" },
  });

const invitationEntry = (entries: StaffEntry[], id: number) =>
  entries.find((entry) => "invitationId" in entry && entry.invitationId === id);

const accountEntry = (entries: StaffEntry[], id: number) =>
  entries.find((entry) => "accountId" in entry && entry.accountId === id);

const keysOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
};

const groupOf = (entry: StaffEntry) => (entry.status === "accepted" ? 1 : 0);
const idOf = (entry: StaffEntry) =>
  entry.status === "accepted" ? entry.accountId : entry.invitationId;

const insertAccount = (id: number, role: "Evaluator" | "Provincial") =>
  db.insert(accounts).values({
    id,
    username: `${PREFIX}user-${id}`,
    password: PASSWORD_HASH,
    hashedRefreshToken: REFRESH_HASH,
    email: emailOf(`account-${id}`),
    role,
  });

const insertEvaluator = async (id: number) => {
  await insertAccount(id, "Evaluator");
  await db.insert(evaluators).values({
    accountId: id,
    level: "Mental",
    firstName: "ผู้ประเมิน",
    lastName: `${id}`,
    region: province.healthRegion,
    phoneNumber: "0822222222",
  });
};

const insertOfficer = async (id: number) => {
  await insertAccount(id, "Provincial");
  await db.insert(provincialOfficers).values({
    accountId: id,
    firstName: "เจ้าหน้าที่",
    lastName: `${id}`,
    phoneNumber: "0833333333",
    provinceId: province.provinceId,
  });
};

const insertEvaluatorInvitation = (id: number, expiresAt: Date) =>
  db.insert(invitations).values({
    id,
    email: emailOf(`invitation-${id}`),
    role: "Evaluator",
    firstName: "รอตอบรับ",
    lastName: `${id}`,
    phoneNumber: "0844444444",
    level: "ODPC",
    region: province.healthRegion,
    tokenHash: `${TOKEN_HASH}-${id}`,
    expiresAt,
  });

const insertProvincialInvitation = (id: number, expiresAt: Date) =>
  db.insert(invitations).values({
    id,
    email: emailOf(`invitation-${id}`),
    role: "Provincial",
    firstName: "รอตอบรับ",
    lastName: `${id}`,
    phoneNumber: "0855555555",
    provinceId: province.provinceId,
    tokenHash: `${TOKEN_HASH}-${id}`,
    expiresAt,
  });

const cleanup = async () => {
  await db.delete(invitations).where(like(invitations.email, `${PREFIX}%`));
  await db.delete(provincialOfficers).where(inArray(provincialOfficers.accountId, ACCOUNT_IDS));
  await db
    .delete(accounts)
    .where(or(inArray(accounts.id, ACCOUNT_IDS), like(accounts.email, `${PREFIX}%`)));
};

describeDb("GET /admins/staff", () => {
  beforeAll(async () => {
    await cleanup();
    adminToken = await signAccessToken({
      id: ADMIN_ID,
      username: "test_staff_admin",
      role: Role.DOED,
    });
    const [firstProvince] = await db.select().from(provinces).limit(1);
    if (!firstProvince) throw new Error("seed the disposable database before running this file");
    province = firstProvince;

    const seeded = await Promise.all([
      db.select({ id: evaluators.accountId }).from(evaluators),
      db.select({ id: provincialOfficers.accountId }).from(provincialOfficers),
    ]);
    seededAccountIds = seeded.flat().map(({ id }) => id);

    const now = Date.now();
    await insertEvaluatorInvitation(INVITATION.eval, new Date(now + HOUR));
    await insertProvincialInvitation(INVITATION.provExpired, new Date(now - HOUR));
    await insertEvaluatorInvitation(INVITATION.evalExpired, new Date(now - HOUR));
    await insertProvincialInvitation(INVITATION.prov, new Date(now + HOUR));

    await insertOfficer(ACCOUNT.provHigh);
    await insertEvaluator(ACCOUNT.evalHigh);
    await insertOfficer(ACCOUNT.provLow);
    await insertEvaluator(ACCOUNT.evalLow);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  describe("access", () => {
    it.each([
      Role.Factory,
      Role.Provincial,
      Role.Evaluator,
    ])("refuses %s with 403", async (role) => {
      const token = await signAccessToken({ id: ADMIN_ID, username: "test_staff_x", role });
      const response = await authenticatedRequest(STAFF_ROUTE, { token });

      expect(response.status).toBe(403);
      expect(response.body).not.toContain(PREFIX);
    });

    it("refuses an anonymous caller with 401", async () => {
      const response = await authenticatedRequest(STAFF_ROUTE);

      expect(response.status).toBe(401);
      expect(response.body).not.toContain(PREFIX);
    });
  });

  describe("who is listed", () => {
    it("lists every seeded Evaluator and Provincial Officer as accepted", async () => {
      const { entries } = await listStaff();

      expect(seededAccountIds.length).toBeGreaterThan(0);
      const listed = entries.flatMap((entry) =>
        entry.status === "accepted" ? [entry.accountId] : [],
      );
      expect(listed).toEqual(expect.arrayContaining(seededAccountIds));
    });

    it("shows a whole Evaluator and a whole Officer who hold accounts", async () => {
      const { entries } = await listStaff();

      expect(accountEntry(entries, ACCOUNT.evalLow)).toEqual({
        status: "accepted",
        accountId: ACCOUNT.evalLow,
        username: `${PREFIX}user-${ACCOUNT.evalLow}`,
        role: "Evaluator",
        firstName: "ผู้ประเมิน",
        lastName: `${ACCOUNT.evalLow}`,
        email: emailOf(`account-${ACCOUNT.evalLow}`),
        phoneNumber: "0822222222",
        level: "Mental",
        region: province.healthRegion,
        provinceId: null,
        provinceName: null,
      });
      expect(accountEntry(entries, ACCOUNT.provLow)).toEqual({
        status: "accepted",
        accountId: ACCOUNT.provLow,
        username: `${PREFIX}user-${ACCOUNT.provLow}`,
        role: "Provincial",
        firstName: "เจ้าหน้าที่",
        lastName: `${ACCOUNT.provLow}`,
        email: emailOf(`account-${ACCOUNT.provLow}`),
        phoneNumber: "0833333333",
        level: null,
        region: null,
        provinceId: province.provinceId,
        provinceName: province.nameTh,
      });
    });

    it("shows a whole Invitation of each role", async () => {
      const { entries } = await listStaff();

      expect(invitationEntry(entries, INVITATION.eval)).toEqual({
        status: "pending",
        invitationId: INVITATION.eval,
        role: "Evaluator",
        firstName: "รอตอบรับ",
        lastName: `${INVITATION.eval}`,
        email: emailOf(`invitation-${INVITATION.eval}`),
        phoneNumber: "0844444444",
        level: "ODPC",
        region: province.healthRegion,
        provinceId: null,
        provinceName: null,
      });
      expect(invitationEntry(entries, INVITATION.prov)).toEqual({
        status: "pending",
        invitationId: INVITATION.prov,
        role: "Provincial",
        firstName: "รอตอบรับ",
        lastName: `${INVITATION.prov}`,
        email: emailOf(`invitation-${INVITATION.prov}`),
        phoneNumber: "0855555555",
        level: null,
        region: null,
        provinceId: province.provinceId,
        provinceName: province.nameTh,
      });
    });

    it("moves a person from pending to accepted when they accept", async () => {
      const email = newEmail();
      const { id, token } = await invite(email);

      expect(invitationEntry((await listStaff()).entries, id)?.status).toBe("pending");
      expect((await accept(token)).status).toBe(200);

      const { entries } = await listStaff();
      expect(invitationEntry(entries, id)).toBeUndefined();
      expect(entries.filter((entry) => entry.email === email)).toEqual([
        {
          status: "accepted",
          accountId: expect.any(Number),
          username: email,
          role: "Evaluator",
          firstName: "เชิญ",
          lastName: "ทางอีเมล",
          email,
          phoneNumber: "0811111111",
          level: "DOH",
          region: province.healthRegion,
          provinceId: null,
          provinceName: null,
        },
      ]);
    });
  });

  describe("Invitation status", () => {
    it("marks an Invitation expired once its link no longer works, and keeps it listed", async () => {
      const email = newEmail();
      const { id, token } = await invite(email);
      expect(invitationEntry((await listStaff()).entries, id)?.status).toBe("pending");

      await db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(invitations.id, id));

      expect(invitationEntry((await listStaff()).entries, id)?.status).toBe("expired");
      expect((await accept(token)).status).toBe(400);
      expect(invitationEntry((await listStaff()).entries, id)?.status).toBe("expired");
    });

    it("reports both roles as expired past their expiry", async () => {
      const { entries } = await listStaff();

      expect(invitationEntry(entries, INVITATION.evalExpired)?.status).toBe("expired");
      expect(invitationEntry(entries, INVITATION.provExpired)?.status).toBe("expired");
    });
  });

  describe("secrets", () => {
    it("never returns a password hash, a token hash or a token", async () => {
      const email = newEmail();
      const { token } = await invite(email);
      const { body, entries } = await listStaff();

      expect(invitationEntry(entries, INVITATION.eval)).toBeDefined();
      expect(accountEntry(entries, ACCOUNT.evalLow)).toBeDefined();
      expect(body).toContain(email);
      expect(body).not.toContain(PASSWORD_HASH);
      expect(body).not.toContain(REFRESH_HASH);
      expect(body).not.toContain(TOKEN_HASH);
      expect(body).not.toContain(token);
      expect(body).not.toContain(Bun.SHA256.hash(token, "hex"));
      expect(body).not.toMatch(/\$2[aby]\$/);
    });

    it("never carries a key that names a secret", async () => {
      const { entries } = await listStaff();

      const keys = new Set(keysOf(entries));
      expect(keys.has("status")).toBe(true);
      for (const secret of ["password", "hashedRefreshToken", "tokenHash"]) {
        expect(keys.has(secret)).toBe(false);
      }
    });
  });

  describe("order", () => {
    it("puts Invitations by id before accounts by id, across roles and statuses", async () => {
      const { entries } = await listStaff();

      const fixtures = entries.flatMap((entry) => {
        if (entry.status === "accepted") {
          return ACCOUNT_IDS.includes(entry.accountId) ? [`account ${entry.accountId}`] : [];
        }
        return entry.email.startsWith(`${PREFIX}invitation-`)
          ? [`invitation ${entry.invitationId}`]
          : [];
      });
      expect(fixtures).toEqual([
        `invitation ${INVITATION.prov}`,
        `invitation ${INVITATION.evalExpired}`,
        `invitation ${INVITATION.provExpired}`,
        `invitation ${INVITATION.eval}`,
        `account ${ACCOUNT.evalLow}`,
        `account ${ACCOUNT.provLow}`,
        `account ${ACCOUNT.evalHigh}`,
        `account ${ACCOUNT.provHigh}`,
      ]);
    });

    it("holds that order over the whole list", async () => {
      const { entries } = await listStaff();

      const ordered = [...entries].sort((a, b) => groupOf(a) - groupOf(b) || idOf(a) - idOf(b));
      expect(entries.length).toBeGreaterThan(Object.keys(ACCOUNT).length);
      expect(entries).toEqual(ordered);
    });

    it("returns the same bytes on two requests", async () => {
      const first = await listStaff();
      const second = await listStaff();

      expect(second.body).toBe(first.body);
    });

    it("stays a bare array", async () => {
      expect(Array.isArray((await listStaff()).entries)).toBe(true);
    });
  });
});
