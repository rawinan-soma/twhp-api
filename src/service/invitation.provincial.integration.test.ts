import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { resolve } from "node:path";
import { eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accounts,
  answerLogs,
  answers,
  coverLogs,
  covers,
  enrolls,
  invitations,
  provincialOfficers,
  questions,
} from "../drizzle/schema";
import { authenticatedRequest, signAccessToken } from "../test/authenticated-request";
import type { AccessMatrix } from "../test/route-access-matrix";
import {
  geoOf,
  pickRegionLayout,
  removeFactoryWithCovers,
  seedEnrollWithCover,
  seedFactoryInProvince,
} from "../test/staff-list-fixtures";
import { Role } from "./authentication";

setDefaultTimeout(30_000);

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[provincial invitation integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const INVITATIONS_ROUTE = "src/routes/admins/invitations/index.ts";
const AUTHENTICATION_ROUTE = "src/routes/authentication/index.ts";
const OFFICER_ROUTE = "src/routes/provincialOfficers/index.ts";
const OFFICER_FACTORIES_ROUTE = "src/routes/provincialOfficers/factories/index.ts";
const OFFICER_ENROLLS_ROUTE = "src/routes/provincialOfficers/enrolls/index.ts";
const OFFICER_ANSWERS_ROUTE = "src/routes/provincialOfficers/covers/[coverId]/answers/index.ts";

const ADMIN_ID = 99520;
const OWN_FACTORY_ID = 99521;
const OTHER_FACTORY_ID = 99522;
const TEST_PREFIX = "inv52-";
const PASSWORD = "chosen-by-the-officer";
const FISCAL_YEAR = 2024;
const ENROLL_DATE = "2024-01-15";

const newEmail = () => `${TEST_PREFIX}${crypto.randomUUID()}@test.com`;

let adminToken: string;
let ownProvince: number;
let otherProvince: number;

const invite = (overrides: Record<string, unknown> = {}, token: string | null = adminToken) =>
  authenticatedRequest(INVITATIONS_ROUTE, {
    method: "POST",
    token: token ?? undefined,
    body: {
      role: "Provincial",
      email: newEmail(),
      firstName: "สมหญิง",
      lastName: "รักดี",
      phoneNumber: "0812345678",
      provinceId: ownProvince,
      ...overrides,
    },
  });

const accept = (token: string) =>
  authenticatedRequest(AUTHENTICATION_ROUTE, {
    method: "POST",
    path: "/accept-invitation",
    body: { token, password: PASSWORD },
  });

const login = (username: string, password = PASSWORD) =>
  authenticatedRequest(AUTHENTICATION_ROUTE, {
    method: "POST",
    path: "/login",
    body: { username, password },
  });

const cookieValue = (setCookies: string[], name: string) =>
  setCookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    ?.slice(name.length + 1);

const inviteAcceptAndLogIn = async () => {
  const email = newEmail();
  const invited = await invite({ email });
  expect(invited.status).toBe(201);
  const accepted = await accept(invited.queuedEmails[0]?.data.token as string);
  const challenge = await login(email);
  const { challengeId } = challenge.json<{ challengeId: string }>();
  const otpEmail = challenge.queuedEmails.find((job) => job.name === "2fa-otp");
  const verified = await authenticatedRequest(AUTHENTICATION_ROUTE, {
    method: "POST",
    path: "/login/verify-otp",
    body: { challengeId, code: otpEmail?.data.code },
  });
  const session = cookieValue(verified.setCookies, "Authentication");
  if (!session) throw new Error(`no session after OTP: ${verified.status} ${verified.body}`);
  return { email, accepted, challenge, otpEmail, session };
};

const readAnswers = (coverId: number, token: string) =>
  authenticatedRequest(OFFICER_ANSWERS_ROUTE, {
    token,
    mountAt: "/covers/:coverId/answers",
    path: `/covers/${coverId}/answers`,
  });

const addCover = async (
  factoryId: number,
  latestStatus: "in_progress" | "in_review" | "finished",
) => {
  const [enroll] = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, factoryId));
  if (!enroll) throw new Error(`factory ${factoryId} has no enroll`);
  const [cover] = await db
    .insert(covers)
    .values({ enrollId: enroll.id })
    .returning({ id: covers.id });
  if (!cover) throw new Error("cover insert returned nothing");
  await db.insert(coverLogs).values({ coverId: cover.id, status: latestStatus });
  return cover.id;
};

const addVerdictAnswer = async (coverId: number, questionId: number, description: string) => {
  const [answer] = await db
    .insert(answers)
    .values({ questionId, coverId, selectedChoice: "2" })
    .returning({ id: answers.id });
  if (!answer) throw new Error("answer insert returned nothing");
  await db.insert(answerLogs).values({ answerId: answer.id, status: "in_review" });
  await db
    .insert(answerLogs)
    .values({ answerId: answer.id, status: "recommended", verdictChoice: "1", description });
  return answer.id;
};

const removeCovers = async (factoryIds: number[]) => {
  const enrollIds = (
    await db.select({ id: enrolls.id }).from(enrolls).where(inArray(enrolls.factoryId, factoryIds))
  ).map(({ id }) => id);
  if (enrollIds.length === 0) return;
  const coverIds = (
    await db.select({ id: covers.id }).from(covers).where(inArray(covers.enrollId, enrollIds))
  ).map(({ id }) => id);
  if (coverIds.length === 0) return;
  const answerIds = (
    await db.select({ id: answers.id }).from(answers).where(inArray(answers.coverId, coverIds))
  ).map(({ id }) => id);
  if (answerIds.length > 0)
    await db.delete(answerLogs).where(inArray(answerLogs.answerId, answerIds));
  await db.delete(answers).where(inArray(answers.coverId, coverIds));
};

const invitedAccountIds = () =>
  db
    .select({ id: accounts.id })
    .from(accounts)
    .where(like(sql`lower(${accounts.email})`, `${TEST_PREFIX}%`));

const cleanup = async () => {
  await removeCovers([OWN_FACTORY_ID, OTHER_FACTORY_ID]);
  await removeFactoryWithCovers(db, OWN_FACTORY_ID);
  await removeFactoryWithCovers(db, OTHER_FACTORY_ID);
  const ids = (await invitedAccountIds()).map(({ id }) => id);
  if (ids.length > 0) {
    await db.delete(provincialOfficers).where(inArray(provincialOfficers.accountId, ids));
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
  await db.delete(invitations).where(like(invitations.email, `${TEST_PREFIX}%`));
};

const unreachableBackingServices = {
  DATABASE_URL: "postgresql://nobody:nobody@127.0.0.1:1/nothing",
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: "1",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1",
  MINIO_ENDPOINT: "127.0.0.1",
  MINIO_PORT: "1",
};

const registeredRoutes = async () => {
  const child = Bun.spawn(["bun", resolve(import.meta.dir, "../test/route-access-matrix.ts")], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...unreachableBackingServices },
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`route-access-matrix exited ${code}: ${err}`);
  return JSON.parse(out) as AccessMatrix;
};

describeDb("Provincial Officer Invitations", () => {
  beforeAll(async () => {
    await cleanup();
    adminToken = await signAccessToken({
      id: ADMIN_ID,
      username: "test_invitation_provincial_admin",
      role: Role.DOED,
    });
    const layout = await pickRegionLayout(db);
    ownProvince = layout.provinceInRegion;
    otherProvince = layout.provinceOutOfRegion;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  describe("access to the create route", () => {
    it("lets an Admin invite, queues the username and link, and leaves no account", async () => {
      const email = newEmail();
      const response = await invite({ email });

      expect(response.status).toBe(201);
      expect(response.queuedEmails).toHaveLength(1);
      expect(response.queuedEmails[0]?.name).toBe("invitation");
      expect(response.queuedEmails[0]?.data.email).toBe(email);
      expect(response.queuedEmails[0]?.data.token).toMatch(/^[0-9a-f]{64}$/);

      const pendingLogin = await login(email);
      expect(pendingLogin.status).toBe(401);
    });

    it.each([
      Role.Factory,
      Role.Provincial,
      Role.Evaluator,
    ])("refuses %s with 403", async (role) => {
      const token = await signAccessToken({ id: ADMIN_ID, username: "test_inv52_x", role });
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

  describe("refused bodies", () => {
    it("refuses a province that does not exist", async () => {
      const email = newEmail();
      const response = await invite({ email, provinceId: 999_999 });

      expect(response.status).toBe(400);
      expect(response.json<{ message: string }>().message).toBe("province not found");
      expect(response.queuedEmails).toEqual([]);
      expect(await db.select().from(invitations).where(eq(invitations.email, email))).toEqual([]);
    });

    it.each([
      ["Provincial with an Evaluator level", { level: "ODPC" }],
      ["Provincial with a health region", { region: 1 }],
      ["Provincial with a level and a region", { level: "ODPC", region: 1 }],
      ["Evaluator with a province", { role: "Evaluator", level: "ODPC", region: 1 }],
      ["no province", { provinceId: undefined }],
      ["no first name", { firstName: undefined }],
      ["no last name", { lastName: undefined }],
      ["no phone", { phoneNumber: undefined }],
      ["no email", { email: undefined }],
      ["a malformed email", { email: "not-an-email" }],
    ] as const)("refuses %s as a schema failure", async (_name, overrides) => {
      const response = await invite(overrides);

      expect(response.status).toBe(422);
      expect(response.queuedEmails).toEqual([]);
    });
  });

  describe("accepting an Invitation", () => {
    it("creates the account and Officer, sets no cookies, and demands OTP at first login", async () => {
      const { email, accepted, challenge, otpEmail, session } = await inviteAcceptAndLogIn();

      expect(accepted.status).toBe(200);
      expect(accepted.setCookies).toEqual([]);
      expect(await db.select().from(invitations).where(eq(invitations.email, email))).toEqual([]);

      expect(challenge.status).toBe(200);
      expect(challenge.setCookies).toEqual([]);
      expect(challenge.json<{ twoFactorRequired: boolean }>().twoFactorRequired).toBe(true);
      expect(otpEmail?.data.email).toBe(email);

      const whoami = await authenticatedRequest(AUTHENTICATION_ROUTE, { token: session });
      expect(whoami.status).toBe(200);
      expect(whoami.json<{ username: string; role: string; change_pw: boolean }>()).toMatchObject({
        username: email,
        role: "Provincial",
        change_pw: true,
      });
    });
  });

  describe("the accepted Officer", () => {
    let session: string;
    let email: string;
    let inProgressCover: number;
    let inReviewCover: number;
    let finishedCover: number;
    let otherProvinceCover: number;
    let inReviewAnswer: number;

    beforeAll(async () => {
      const geoOwn = await geoOf(db, ownProvince);
      const geoOther = await geoOf(db, otherProvince);
      await seedFactoryInProvince(db, OWN_FACTORY_ID, ownProvince, geoOwn);
      await seedFactoryInProvince(db, OTHER_FACTORY_ID, otherProvince, geoOther);
      await seedEnrollWithCover(db, OWN_FACTORY_ID, ENROLL_DATE, "none");
      await seedEnrollWithCover(db, OTHER_FACTORY_ID, ENROLL_DATE, "none");

      inProgressCover = await addCover(OWN_FACTORY_ID, "in_progress");
      inReviewCover = await addCover(OWN_FACTORY_ID, "in_review");
      finishedCover = await addCover(OWN_FACTORY_ID, "finished");
      otherProvinceCover = await addCover(OTHER_FACTORY_ID, "in_review");

      const [question] = await db.select({ id: questions.id }).from(questions).limit(1);
      if (!question) throw new Error("seed the disposable database before running this file");
      inReviewAnswer = await addVerdictAnswer(inReviewCover, question.id, "still deliberating");
      await addVerdictAnswer(finishedCover, question.id, "settled outcome");

      ({ session, email } = await inviteAcceptAndLogIn());
    });

    it("lists factories of its own province and no other", async () => {
      const response = await authenticatedRequest(OFFICER_FACTORIES_ROUTE, {
        token: session,
        query: { validated: true, enrolled: true, fiscalYear: FISCAL_YEAR, limit: 100 },
      });

      expect(response.status).toBe(200);
      const ids = response
        .json<{ items: { account_id: number }[] }>()
        .items.map((f) => f.account_id);
      expect(ids).toContain(OWN_FACTORY_ID);
      expect(ids).not.toContain(OTHER_FACTORY_ID);
    });

    it("lists enrolls of its own province and no other", async () => {
      const response = await authenticatedRequest(OFFICER_ENROLLS_ROUTE, {
        token: session,
        query: { fiscalYear: FISCAL_YEAR, limit: 100 },
      });

      expect(response.status).toBe(200);
      const body = response.json<{ items: { factoryId: number }[] }>();
      const ids = body.items.map((enroll) => enroll.factoryId);
      expect(ids).toContain(OWN_FACTORY_ID);
      expect(ids).not.toContain(OTHER_FACTORY_ID);
    });

    it("gets the same 404 for an in_progress Cover as for another province's Cover", async () => {
      const draft = await readAnswers(inProgressCover, session);
      const foreign = await readAnswers(otherProvinceCover, session);

      expect(draft.status).toBe(404);
      expect(foreign.status).toBe(404);
      expect(draft.json<{ message: string }>().message).toBe("cover not found");
      expect(draft.body).toBe(foreign.body);
    });

    it("sees verdicts and per-Answer status redacted while the Cover is in_review", async () => {
      const response = await readAnswers(inReviewCover, session);

      expect(response.status).toBe(200);
      const { answers: seen } = response.json<{
        answers: { latestVerdictChoice: unknown; latestDescription: unknown; status: string }[];
      }>();
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        latestVerdictChoice: null,
        latestDescription: null,
        status: "in_review",
      });
      expect(response.body).not.toContain("still deliberating");
    });

    it("sees the settled verdict once the Cover is finished", async () => {
      const response = await readAnswers(finishedCover, session);

      expect(response.status).toBe(200);
      const { answers: seen } = response.json<{
        answers: { latestVerdictChoice: unknown; latestDescription: unknown }[];
      }>();
      expect(seen[0]).toMatchObject({
        latestVerdictChoice: "1",
        latestDescription: "settled outcome",
      });
    });

    it.each([
      [
        "evaluators",
        "verdict",
        "src/routes/evaluators/covers/[coverId]/answers/[answerId]/verdict/index.ts",
      ],
      [
        "admins",
        "verdict",
        "src/routes/admins/covers/[coverId]/answers/[answerId]/verdict/index.ts",
      ],
      ["evaluators", "finalize", "src/routes/evaluators/covers/[coverId]/finalize/index.ts"],
      ["admins", "finalize", "src/routes/admins/covers/[coverId]/finalize/index.ts"],
    ] as const)("is refused 403 on the %s %s route and writes no log", async (_owner, action, routeModule) => {
      const before = await db
        .select({ id: answerLogs.id })
        .from(answerLogs)
        .where(eq(answerLogs.answerId, inReviewAnswer));

      const refused = await authenticatedRequest(routeModule, {
        method: "POST",
        token: session,
        body: action === "verdict" ? { decision: "approve" } : undefined,
        mountAt:
          action === "verdict"
            ? "/covers/:coverId/answers/:answerId/verdict"
            : "/covers/:coverId/finalize",
        path:
          action === "verdict"
            ? `/covers/${inReviewCover}/answers/${inReviewAnswer}/verdict`
            : `/covers/${inReviewCover}/finalize`,
      });

      expect(refused.status).toBe(403);
      const after = await db
        .select({ id: answerLogs.id })
        .from(answerLogs)
        .where(eq(answerLogs.answerId, inReviewAnswer));
      expect(after).toEqual(before);
    });

    it("cannot use the seeded first-login step to change its email or password", async () => {
      const replacement = newEmail();
      const refused = await authenticatedRequest(OFFICER_ROUTE, {
        method: "PATCH",
        path: "/password",
        token: session,
        body: { password: "another-password", email: replacement },
      });

      expect(refused.status).toBe(400);
      expect(refused.json<{ message: string }>().message).toBe("password already changed");
      const [account] = await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(eq(accounts.username, email));
      expect(account?.email).toBe(email);
      const stillOldPassword = await login(email);
      expect(stillOldPassword.status).toBe(200);
    });
  });

  describe("routes under /provincialOfficers", () => {
    it("registers no write route but the seeded first-login password step", async () => {
      const { prefix, routes } = await registeredRoutes();
      const officerRoutes = routes
        .filter(({ path }) => path.startsWith(`${prefix}/provincialOfficers`))
        .map(({ method, path }) => `${method} ${path.slice(prefix.length)}`);

      expect(officerRoutes).toContain("GET /provincialOfficers/factories");
      expect(officerRoutes).toContain("GET /provincialOfficers/covers/:coverId/answers");
      expect(officerRoutes.filter((route) => !route.startsWith("GET "))).toEqual([
        "PATCH /provincialOfficers/password",
      ]);
    });
  });
});
