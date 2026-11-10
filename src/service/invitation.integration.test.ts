import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout, spyOn } from "bun:test";
import * as bcrypt from "bcrypt";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { Pool } from "pg";
import {
  accounts,
  districts,
  enrolls,
  evaluators,
  factories,
  invitations,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import type { CreateEnrollWithFilesDto } from "../schema/enroll";
import { authenticatedRequest, signAccessToken } from "../test/authenticated-request";
import { Role } from "./authentication";
import { createEnrollService } from "./enroll";
import { createInvitationService } from "./invitation";

setDefaultTimeout(30_000);

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[invitation integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const INVITATIONS_ROUTE = "src/routes/admins/invitations/index.ts";
const AUTHENTICATION_ROUTE = "src/routes/authentication/index.ts";
const EVALUATOR_ROUTE = "src/routes/evaluators/index.ts";

const ADMIN_ID = 99510;
const FACTORY_ID = 99511;
const TEST_PREFIX = "inv51-";
const PASSWORD = "chosen-by-the-invitee";

const newEmail = () => `${TEST_PREFIX}${crypto.randomUUID()}@test.com`;

let adminToken: string;
let region: number;

const invite = (overrides: Record<string, unknown> = {}, token: string | null = adminToken) =>
  authenticatedRequest(INVITATIONS_ROUTE, {
    method: "POST",
    token: token ?? undefined,
    body: {
      role: "Evaluator",
      email: newEmail(),
      firstName: "สมชาย",
      lastName: "ใจดี",
      phoneNumber: "0812345678",
      level: "ODPC",
      region,
      ...overrides,
    },
  });

const inviteForToken = async (email: string, overrides: Record<string, unknown> = {}) => {
  const response = await invite({ email, ...overrides });
  expect(response.status).toBe(201);
  return response.queuedEmails[0]?.data.token as string;
};

const accept = (token: string, password = PASSWORD) =>
  authenticatedRequest(AUTHENTICATION_ROUTE, {
    method: "POST",
    path: "/accept-invitation",
    body: { token, password },
  });

const login = (username: string, password = PASSWORD) =>
  authenticatedRequest(AUTHENTICATION_ROUTE, {
    method: "POST",
    path: "/login",
    body: { username, password },
  });

const seedAccount = (values: { username: string; email: string }) =>
  db.insert(accounts).values({ ...values, password: "hashed", role: "Factory" });

const removeAccountsMatching = (email: string) =>
  db.delete(accounts).where(sql`lower(${accounts.email}) = ${email.toLowerCase()}`);

const accountsFor = (email: string) =>
  db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      or(
        sql`lower(${accounts.email}) = ${email.toLowerCase()}`,
        sql`lower(${accounts.username}) = ${email.toLowerCase()}`,
      ),
    );

const cookieValue = (setCookies: string[], name: string) =>
  setCookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    ?.slice(name.length + 1);

const cleanup = async () => {
  await db.delete(enrolls).where(eq(enrolls.factoryId, FACTORY_ID));
  await db.delete(factories).where(eq(factories.accountId, FACTORY_ID));
  await db.delete(accounts).where(eq(accounts.id, FACTORY_ID));
  await db
    .delete(accounts)
    .where(
      or(
        like(sql`lower(${accounts.email})`, `${TEST_PREFIX}%`),
        like(sql`lower(${accounts.username})`, `${TEST_PREFIX}%`),
      ),
    );
  await db.delete(invitations).where(like(invitations.email, `${TEST_PREFIX}%`));
};

describeDb("Evaluator Invitations", () => {
  beforeAll(async () => {
    await cleanup();
    adminToken = await signAccessToken({
      id: ADMIN_ID,
      username: "test_invitation_admin",
      role: Role.DOED,
    });
    const [province] = await db.select({ region: provinces.healthRegion }).from(provinces).limit(1);
    if (!province) throw new Error("seed the disposable database before running this file");
    region = province.region;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  describe("access to the create route", () => {
    it.each([
      Role.Factory,
      Role.Provincial,
      Role.Evaluator,
    ])("refuses %s with 403", async (role) => {
      const token = await signAccessToken({ id: ADMIN_ID, username: "test_invitation_x", role });
      const response = await invite({}, token);

      expect(response.status).toBe(403);
      expect(response.queuedEmails).toEqual([]);
    });

    it("refuses an anonymous caller with 401", async () => {
      const response = await invite({}, null);

      expect(response.status).toBe(401);
      expect(response.queuedEmails).toEqual([]);
    });
  });

  describe("creating an Invitation", () => {
    it("queues an email with the username and single-use token, and leaves no account", async () => {
      const email = newEmail();
      const response = await invite({ email, region });

      expect(response.status).toBe(201);
      expect(response.json<{ id: number }>().id).toBeNumber();
      expect(response.queuedEmails).toHaveLength(1);
      const [job] = response.queuedEmails;
      expect(job?.name).toBe("invitation");
      expect(job?.data.email).toBe(email);
      expect(job?.data.token).toMatch(/^[0-9a-f]{64}$/);
      expect(response.body).not.toContain(job?.data.token as string);
      expect(job?.opts).toMatchObject({
        attempts: 3,
        backoff: 5000,
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      });

      expect(await accountsFor(email)).toEqual([]);
      const pendingLogin = await login(email);
      expect(pendingLogin.status).toBe(401);
      expect(pendingLogin.setCookies).toEqual([]);
    });

    it("stores the token only as its SHA-256 hash", async () => {
      const email = newEmail();
      const token = await inviteForToken(email);

      const [row] = await db.select().from(invitations).where(eq(invitations.email, email));

      expect(row?.tokenHash).toBe(Bun.SHA256.hash(token, "hex"));
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it("stores the email in lowercase so the username is always lowercase", async () => {
      const email = newEmail();
      const response = await invite({ email: email.toUpperCase() });

      expect(response.status).toBe(201);
      expect(response.queuedEmails[0]?.data.email).toBe(email);
      expect(await accept(response.queuedEmails[0]?.data.token as string)).toMatchObject({
        status: 200,
      });
      expect((await login(email)).json<{ twoFactorRequired: boolean }>().twoFactorRequired).toBe(
        true,
      );
    });
  });

  describe("refusals", () => {
    it("refuses an email that belongs to an account, whatever the letter case", async () => {
      const email = newEmail();
      await seedAccount({
        username: `${TEST_PREFIX}${crypto.randomUUID()}`,
        email: email.toUpperCase(),
      });

      const response = await invite({ email });

      expect(response.status).toBe(400);
      expect(response.json<{ message: string }>().message).toBe("email already exists");
      expect(response.queuedEmails).toEqual([]);
    });

    it("refuses an email that is another account's username, whatever the letter case", async () => {
      const email = newEmail();
      await seedAccount({ username: email.toUpperCase(), email: newEmail() });

      const response = await invite({ email });

      expect(response.status).toBe(400);
      expect(response.json<{ message: string }>().message).toBe("email already exists");
    });

    it("refuses an email with a pending Invitation, whatever the letter case", async () => {
      const email = newEmail();
      await inviteForToken(email);

      const response = await invite({ email: email.toUpperCase() });

      expect(response.status).toBe(400);
      expect(response.json<{ message: string }>().message).toBe("email already invited");
      expect(response.queuedEmails).toEqual([]);
    });

    it("refuses a health region that does not exist", async () => {
      const email = newEmail();
      const response = await invite({ email, region: 99 });

      expect(response.status).toBe(400);
      expect(response.json<{ message: string }>().message).toBe("health region not found");
      expect(await db.select().from(invitations).where(eq(invitations.email, email))).toEqual([]);
    });

    it("refuses a missing level as a schema failure", async () => {
      const response = await invite({ level: undefined });

      expect(response.status).toBe(422);
      expect(response.queuedEmails).toEqual([]);
    });

    it("refuses an unknown level as a schema failure", async () => {
      const response = await invite({ level: "Provincial" });

      expect(response.status).toBe(422);
      expect(response.queuedEmails).toEqual([]);
    });
  });

  describe("accepting an Invitation", () => {
    it("creates the account and Evaluator, logs nobody in, and demands OTP at first login", async () => {
      const email = newEmail();
      const token = await inviteForToken(email, { level: "DOH" });

      const accepted = await accept(token);

      expect(accepted.status).toBe(200);
      expect(accepted.setCookies).toEqual([]);
      expect(await db.select().from(invitations).where(eq(invitations.email, email))).toEqual([]);

      const challenge = await login(email);
      expect(challenge.status).toBe(200);
      const { twoFactorRequired, challengeId } = challenge.json<{
        twoFactorRequired: boolean;
        challengeId: string;
      }>();
      expect(twoFactorRequired).toBe(true);
      expect(challenge.setCookies).toEqual([]);
      const otpEmail = challenge.queuedEmails.find((job) => job.name === "2fa-otp");
      expect(otpEmail?.data.email).toBe(email);

      const verified = await authenticatedRequest(AUTHENTICATION_ROUTE, {
        method: "POST",
        path: "/login/verify-otp",
        body: { challengeId, code: otpEmail?.data.code },
      });
      expect(verified.status).toBe(200);
      const session = cookieValue(verified.setCookies, "Authentication");
      expect(session).toBeString();

      const whoami = await authenticatedRequest(AUTHENTICATION_ROUTE, { token: session });
      expect(whoami.status).toBe(200);
      expect(
        whoami.json<{ username: string; role: string; change_pw: boolean; eval_level: string }>(),
      ).toMatchObject({ username: email, role: "Evaluator", change_pw: true, eval_level: "DOH" });

      const firstLoginStep = await authenticatedRequest(EVALUATOR_ROUTE, {
        method: "PATCH",
        path: "/password",
        token: session,
        body: { password: "another-password", email: newEmail() },
      });
      expect(firstLoginStep.status).toBe(400);
      expect(firstLoginStep.json<{ message: string }>().message).toBe("password already changed");
    });

    it("gives unknown, expired and used tokens one byte-identical 400", async () => {
      const unknown = await accept("0".repeat(64));

      const expiredEmail = newEmail();
      const expiredToken = await inviteForToken(expiredEmail);
      await db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invitations.email, expiredEmail));
      const expired = await accept(expiredToken);

      const usedToken = await inviteForToken(newEmail());
      expect((await accept(usedToken)).status).toBe(200);
      const used = await accept(usedToken);

      expect(unknown.status).toBe(400);
      expect(unknown.body).toBe('{"message":"invalid token"}');
      expect(expired.status).toBe(400);
      expect(expired.body).toBe(unknown.body);
      expect(used.status).toBe(400);
      expect(used.body).toBe(unknown.body);
      expect(await accountsFor(expiredEmail)).toEqual([]);

      const stillPending = await invite({ email: expiredEmail });
      expect(stillPending.status).toBe(400);
      expect(stillPending.json<{ message: string }>().message).toBe("email already invited");
    });

    it("refuses a password under 8 characters and leaves the link usable", async () => {
      const email = newEmail();
      const token = await inviteForToken(email);

      expect((await accept(token, "")).status).toBe(422);
      expect((await accept(token, "1234567")).status).toBe(422);
      const created = await db.select().from(accounts).where(eq(accounts.email, email));
      expect(created).toHaveLength(0);

      expect((await accept(token, "12345678")).status).toBe(200);
    });

    it("spends no password hashing on a token that matches nothing", async () => {
      const hash = spyOn(bcrypt, "hash");
      try {
        const refused = await createInvitationService(db as never).acceptInvitation(
          "no-such-token",
          PASSWORD,
        );

        expect(refused).toBeInstanceOf(ElysiaCustomStatusResponse);
        expect((refused as ElysiaCustomStatusResponse<400>).code).toBe(400);
        expect(hash).not.toHaveBeenCalled();
      } finally {
        hash.mockRestore();
      }
    });

    it("creates exactly one account from concurrent accepts", async () => {
      const email = newEmail();
      const token = await inviteForToken(email);

      const responses = await Promise.all([
        accept(token),
        accept(token),
        accept(token),
        accept(token),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 400, 400, 400]);
      const refused = responses.filter((response) => response.status === 400);
      expect(new Set(refused.map((response) => response.body))).toEqual(
        new Set(['{"message":"invalid token"}']),
      );
      const created = await accountsFor(email);
      expect(created).toHaveLength(1);
      const profiles = await db
        .select({ accountId: evaluators.accountId })
        .from(evaluators)
        .where(eq(evaluators.accountId, created[0]?.id as number));
      expect(profiles).toHaveLength(1);
    });

    it.each([
      ["email", (email: string) => ({ username: newEmail(), email: email.toUpperCase() })],
      ["username", (email: string) => ({ username: email.toUpperCase(), email: newEmail() })],
    ])("refuses an email another account claimed by %s after the invite, and keeps the Invitation", async (_column, claimedAccount) => {
      const email = newEmail();
      const token = await inviteForToken(email);
      const claim = claimedAccount(email);
      await seedAccount(claim);

      const refused = await accept(token);

      expect(refused.status).toBe(400);
      expect(refused.body).toBe('{"message":"invalid token"}');
      expect(await login(email)).toMatchObject({ status: 401 });

      await removeAccountsMatching(claim.email);
      const acceptedAfterRelease = await accept(token);
      expect(acceptedAfterRelease.status).toBe(200);
      expect((await login(email)).status).toBe(200);
    });
  });

  describe("seeded first login", () => {
    it("still skips OTP once and sets the email and password through the first-login step", async () => {
      const username = `${TEST_PREFIX}${crypto.randomUUID()}`;
      const password = "seeded-password";
      const [account] = await db
        .insert(accounts)
        .values({
          username,
          email: `${username}@seed.test`,
          password: await bcrypt.hash(password, 4),
          role: "Evaluator",
        })
        .returning({ id: accounts.id });
      await db.insert(evaluators).values({
        accountId: account?.id as number,
        level: "ODPC",
        firstName: "ทดสอบ",
        lastName: "ทดสอบ",
        region,
        phoneNumber: "0000000000",
      });

      const firstLogin = await login(username, password);
      expect(firstLogin.status).toBe(200);
      expect(firstLogin.json<{ twoFactorRequired?: boolean }>().twoFactorRequired).toBeUndefined();
      const session = cookieValue(firstLogin.setCookies, "Authentication");

      const newPassword = "changed-at-first-login";
      const changed = await authenticatedRequest(EVALUATOR_ROUTE, {
        method: "PATCH",
        path: "/password",
        token: session,
        body: { password: newPassword, email: newEmail() },
      });
      expect(changed.status).toBe(200);

      const secondLogin = await login(username, newPassword);
      expect(secondLogin.json<{ twoFactorRequired: boolean }>().twoFactorRequired).toBe(true);
    });
  });

  describe("enrollment", () => {
    it("never records a person whose Invitation is still pending", async () => {
      const [place] = await db
        .select({
          provinceId: provinces.provinceId,
          region: provinces.healthRegion,
          districtId: districts.districtId,
          subdistrictId: subdistricts.subdistrictId,
        })
        .from(provinces)
        .innerJoin(districts, eq(districts.provinceId, provinces.provinceId))
        .innerJoin(subdistricts, eq(subdistricts.districtId, districts.districtId))
        .limit(1);
      if (!place) throw new Error("seed the disposable database before running this file");

      await db.insert(accounts).values({
        id: FACTORY_ID,
        username: `${TEST_PREFIX}factory`,
        password: "hashed",
        email: `${TEST_PREFIX}factory@test.com`,
        role: "Factory",
      });
      await db.insert(factories).values({
        accountId: FACTORY_ID,
        factoryType: 1,
        nameTh: "โรงงานทดสอบคำเชิญ",
        nameEn: "Invitation Test Factory",
        tsicCode: "1011",
        addressNo: "1",
        zipcode: "10000",
        phoneNumber: "0000000000",
        provinceId: place.provinceId,
        districtId: place.districtId,
        subdistrictId: place.subdistrictId,
        isValidate: true,
      });

      const invited = newEmail();
      await inviteForToken(invited, { region: place.region, level: "ODPC" });

      const result = await createEnrollService(db).create(enrollDto(), FACTORY_ID);

      expect(result).not.toBeInstanceOf(ElysiaCustomStatusResponse);
      const [enrollment] = await db
        .select({
          evalOdpcId: enrolls.evalOdpcId,
          evalDohId: enrolls.evalDohId,
          evalMentalId: enrolls.evalMentalId,
        })
        .from(enrolls)
        .where(eq(enrolls.factoryId, FACTORY_ID));
      const recorded = await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(
          inArray(accounts.id, [
            enrollment?.evalOdpcId,
            enrollment?.evalDohId,
            enrollment?.evalMentalId,
          ] as number[]),
        );
      expect(recorded.length).toBeGreaterThan(0);
      expect(recorded.map((row) => row.email)).not.toContain(invited);
      expect(await accountsFor(invited)).toEqual([]);
      expect(
        await db
          .select({ id: invitations.id })
          .from(invitations)
          .where(and(eq(invitations.email, invited), eq(invitations.region, place.region))),
      ).toHaveLength(1);
    });
  });
});

const enrollDto = () =>
  ({
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
    safetyOfficerEmail: `${TEST_PREFIX}safety@test.com`,
  }) as CreateEnrollWithFilesDto;
