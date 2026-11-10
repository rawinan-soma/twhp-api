import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts, evaluators, invitations, provinces } from "../drizzle/schema";
import { authenticatedRequest, signAccessToken } from "../test/authenticated-request";
import { Role } from "./authentication";

setDefaultTimeout(60_000);

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[invitation pending actions] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const INVITATIONS_ROUTE = "src/routes/admins/invitations/index.ts";
const AUTHENTICATION_ROUTE = "src/routes/authentication/index.ts";

const ADMIN_ID = 99530;
const TEST_PREFIX = "inv53-";
const PASSWORD = "chosen-by-the-invitee";
const INVALID_TOKEN = { message: "invalid token" };
const NOT_FOUND = { message: "invitation not found" };
const UNUSED_INVITATION_ID = 2_147_483_000;

const newEmail = () => `${TEST_PREFIX}${crypto.randomUUID()}@test.com`;

let adminToken: string;
let region: number;

type Identity = { token?: string };

const invite = async (email = newEmail()) => {
  const response = await authenticatedRequest(INVITATIONS_ROUTE, {
    method: "POST",
    token: adminToken,
    body: {
      role: "Evaluator",
      email,
      firstName: "สมชาย",
      lastName: "ใจดี",
      phoneNumber: "0812345678",
      level: "ODPC",
      region,
    },
  });
  expect(response.status).toBe(201);
  return {
    id: response.json<{ id: number }>().id,
    email,
    token: response.queuedEmails[0]?.data.token as string,
  };
};

const resend = (id: number | string, { token = adminToken }: Identity = {}) =>
  authenticatedRequest(INVITATIONS_ROUTE, { method: "POST", path: `/${id}/resend`, token });

const correctEmail = (id: number | string, email: string, { token = adminToken }: Identity = {}) =>
  authenticatedRequest(INVITATIONS_ROUTE, {
    method: "PATCH",
    path: `/${id}/email`,
    token,
    body: { email },
  });

const cancel = (id: number | string, { token = adminToken }: Identity = {}) =>
  authenticatedRequest(INVITATIONS_ROUTE, { method: "DELETE", path: `/${id}`, token });

const accept = (token: string) =>
  authenticatedRequest(AUTHENTICATION_ROUTE, {
    method: "POST",
    path: "/accept-invitation",
    body: { token, password: PASSWORD },
  });

const expectRefused = async (token: string) => {
  const response = await accept(token);
  expect(response.status).toBe(400);
  expect(response.json<{ message: string }>()).toEqual(INVALID_TOKEN);
};

const firstLink = (response: Awaited<ReturnType<typeof authenticatedRequest>>) => {
  expect(response.status).toBe(200);
  expect(response.queuedEmails.map(({ name }) => name)).toEqual(["invitation"]);
  expect(["Evaluator", "Provincial"]).toContain(response.queuedEmails[0]?.data.role as string);
  return response.queuedEmails[0]?.data as { email: string; token: string };
};

const accountsFor = (email: string) =>
  db
    .select({ id: accounts.id, username: accounts.username, email: accounts.email })
    .from(accounts)
    .where(
      or(
        sql`lower(${accounts.email}) = ${email.toLowerCase()}`,
        sql`lower(${accounts.username}) = ${email.toLowerCase()}`,
      ),
    );

const pendingRow = async (id: number) => {
  const [row] = await db.select().from(invitations).where(eq(invitations.id, id));
  return row;
};

const expireInvitation = (id: number) =>
  db
    .update(invitations)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(invitations.id, id));

const seedAccount = (values: { username: string; email: string }) =>
  db.insert(accounts).values({ ...values, password: "hashed", role: "Factory" });

const cleanup = async () => {
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

describeDb("pending Invitation actions", () => {
  beforeAll(async () => {
    await cleanup();
    adminToken = await signAccessToken({
      id: ADMIN_ID,
      username: "test_pending_actions_admin",
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

  describe("access", () => {
    const actions = {
      resend,
      correct: (id: number, identity: Identity) => correctEmail(id, newEmail(), identity),
      cancel,
    };

    for (const [name, act] of Object.entries(actions)) {
      for (const role of [Role.Factory, Role.Provincial, Role.Evaluator]) {
        it(`${name} refuses ${role} with 403 and changes nothing`, async () => {
          const { id, email, token } = await invite();
          const before = await pendingRow(id);
          const forbidden = await signAccessToken({ id: ADMIN_ID + 1, username: "other", role });

          const response = await act(id, { token: forbidden });

          expect(response.status).toBe(403);
          expect(response.queuedEmails).toEqual([]);
          expect(await pendingRow(id)).toEqual(before as NonNullable<typeof before>);
          expect((await accept(token)).status).toBe(200);
          expect(await accountsFor(email)).toHaveLength(1);
        });
      }

      it(`${name} refuses an anonymous caller with 401`, async () => {
        const { id } = await invite();
        const response = await act(id, { token: "" });
        expect(response.status).toBe(401);
        expect(response.queuedEmails).toEqual([]);
      });
    }
  });

  describe("resend", () => {
    it("voids the old link with the identical refusal and the new link works", async () => {
      const { id, email, token: oldToken } = await invite();

      const link = firstLink(await resend(id));

      expect(link.email).toBe(email);
      expect(link.token).not.toBe(oldToken);
      await expectRefused(oldToken);
      expect(await accountsFor(email)).toHaveLength(0);
      expect((await accept(link.token)).status).toBe(200);
      expect(await accountsFor(email)).toHaveLength(1);
    });

    it("voids every earlier link when resent twice", async () => {
      const { id, token: first } = await invite();
      const second = firstLink(await resend(id)).token;
      const third = firstLink(await resend(id)).token;

      await expectRefused(first);
      await expectRefused(second);
      expect((await accept(third)).status).toBe(200);
    });

    it("issues a new 10 minutes on an expired Invitation, which can then be accepted", async () => {
      const { id, email, token: oldToken } = await invite();
      await expireInvitation(id);
      await expectRefused(oldToken);

      const link = firstLink(await resend(id));

      const row = await pendingRow(id);
      const remainingSeconds = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 1000;
      expect(remainingSeconds).toBeGreaterThan(590);
      expect(remainingSeconds).toBeLessThanOrEqual(600);
      expect((await accept(link.token)).status).toBe(200);
      expect(await accountsFor(email)).toHaveLength(1);
    });

    it("changes nothing else about the Invitation", async () => {
      const { id } = await invite();
      const before = await pendingRow(id);

      firstLink(await resend(id));

      expect(await pendingRow(id)).toEqual({
        ...before,
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      });
    });
  });

  describe("email correction", () => {
    it("voids the old link, sends a new one to the corrected address, and creates that account", async () => {
      const { id, email: mistyped, token: oldToken } = await invite();
      const corrected = newEmail();

      const link = firstLink(await correctEmail(id, corrected));

      expect(link.email).toBe(corrected);
      await expectRefused(oldToken);
      expect(await accountsFor(corrected)).toHaveLength(0);
      expect((await accept(link.token)).status).toBe(200);
      const [account] = await accountsFor(corrected);
      expect(account?.username).toBe(corrected);
      expect(account?.email).toBe(corrected);
      expect(await accountsFor(mistyped)).toHaveLength(0);
      expect(
        await db
          .select()
          .from(evaluators)
          .where(eq(evaluators.accountId, account?.id ?? -1)),
      ).toHaveLength(1);
    });

    it("stores and mails the corrected email lowercased", async () => {
      const { id } = await invite();
      const corrected = newEmail();

      const link = firstLink(await correctEmail(id, corrected.toUpperCase()));

      expect(link.email).toBe(corrected);
      expect((await pendingRow(id))?.email).toBe(corrected);
    });

    it("issues a new link for an expired Invitation", async () => {
      const { id } = await invite();
      await expireInvitation(id);
      const corrected = newEmail();

      const link = firstLink(await correctEmail(id, corrected));

      expect((await accept(link.token)).status).toBe(200);
      expect(await accountsFor(corrected)).toHaveLength(1);
    });

    const refusesAndKeepsTheLink = async (
      target: (taken: string) => string,
      message: string,
      seed: (taken: string) => Promise<unknown>,
    ) => {
      const { id, email, token } = await invite();
      const taken = newEmail();
      await seed(taken);
      const before = await pendingRow(id);

      const response = await correctEmail(id, target(taken));

      expect(response.status).toBe(400);
      expect(response.json<{ message: string }>()).toEqual({ message });
      expect(response.queuedEmails).toEqual([]);
      expect(await pendingRow(id)).toEqual(before as NonNullable<typeof before>);
      expect((await accept(token)).status).toBe(200);
      expect(await accountsFor(email)).toHaveLength(1);
    };

    const mixedCase = (email: string) => email.toUpperCase();

    it("refuses an email that belongs to an account, in a different letter case", () =>
      refusesAndKeepsTheLink(mixedCase, "email already exists", (taken) =>
        seedAccount({ username: `${TEST_PREFIX}${crypto.randomUUID()}`, email: taken }),
      ));

    it("refuses an email that is another account's username, in a different letter case", () =>
      refusesAndKeepsTheLink(mixedCase, "email already exists", (taken) =>
        seedAccount({ username: taken, email: newEmail() }),
      ));

    it("refuses an email another pending Invitation holds, in a different letter case", () =>
      refusesAndKeepsTheLink(mixedCase, "email already invited", (taken) => invite(taken)));

    it("does not treat the Invitation's own current email as a conflict", async () => {
      const { id, email, token: oldToken } = await invite();

      const link = firstLink(await correctEmail(id, email.toUpperCase()));

      expect(link.email).toBe(email);
      await expectRefused(oldToken);
      expect((await accept(link.token)).status).toBe(200);
    });

    it("maps losing a race for the email on the unique index to the same 400", async () => {
      const { id, token } = await invite();
      const contested = newEmail();
      const rival = await pool.connect();
      try {
        await rival.query("BEGIN");
        await rival.query(
          `INSERT INTO "Invitations"
             (email, role, first_name, last_name, phone_number, level, region, token_hash, expires_at)
           VALUES ($1, 'Evaluator', 'a', 'b', 'c', 'ODPC', $2, $3, now())`,
          [contested, region, crypto.randomUUID()],
        );

        const correction = correctEmail(id, contested);
        await waitForBlockedUpdate();
        await rival.query("COMMIT");

        const response = await correction;
        expect(response.status).toBe(400);
        expect(response.json<{ message: string }>()).toEqual({ message: "email already invited" });
        expect(response.queuedEmails).toEqual([]);
      } finally {
        rival.release();
      }
      expect((await accept(token)).status).toBe(200);
    });

    it("rejects a malformed email as a schema failure", async () => {
      const { id } = await invite();
      expect((await correctEmail(id, "not-an-email")).status).toBe(422);
    });
  });

  describe("cancel", () => {
    it("refuses the link, leaves nothing behind, and allows inviting the email again", async () => {
      const { id, email, token } = await invite();

      const response = await cancel(id);

      expect(response.status).toBe(200);
      expect(response.queuedEmails).toEqual([]);
      await expectRefused(token);
      expect(await pendingRow(id)).toBeUndefined();
      expect(await accountsFor(email)).toHaveLength(0);

      const again = await invite(email);
      expect((await accept(again.token)).status).toBe(200);
      expect(await accountsFor(email)).toHaveLength(1);
    });
  });

  describe("an Invitation that has no row", () => {
    const actOnAll = async (id: number, email: string) =>
      Promise.all([resend(id), correctEmail(id, email), cancel(id)]);

    const expectAllNotFound = (responses: Awaited<ReturnType<typeof actOnAll>>) => {
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.json<{ message: string }>()).toEqual(NOT_FOUND);
        expect(response.queuedEmails).toEqual([]);
      }
    };

    it("returns 404 on a nonexistent Invitation", async () => {
      expectAllNotFound(await actOnAll(UNUSED_INVITATION_ID, newEmail()));
    });

    it("returns 404 on an accepted Invitation", async () => {
      const { id, token } = await invite();
      expect((await accept(token)).status).toBe(200);
      expectAllNotFound(await actOnAll(id, newEmail()));
    });

    it("returns 404, not a duplicate error, correcting an accepted Invitation to its own email", async () => {
      const { id, email, token } = await invite();
      expect((await accept(token)).status).toBe(200);

      const response = await correctEmail(id, email);

      expect(response.status).toBe(404);
      expect(response.json<{ message: string }>()).toEqual(NOT_FOUND);
    });

    it("returns 404 on an already cancelled Invitation", async () => {
      const { id } = await invite();
      expect((await cancel(id)).status).toBe(200);
      expectAllNotFound(await actOnAll(id, newEmail()));
    });

    for (const badId of ["abc", "1.5", "0", "2147483648"]) {
      it(`rejects :id ${badId} as a schema failure on all three routes`, async () => {
        const responses = await Promise.all([
          resend(badId),
          correctEmail(badId, newEmail()),
          cancel(badId),
        ]);
        expect(responses.map(({ status }) => status)).toEqual([422, 422, 422]);
      });
    }
  });

  describe("a resend racing an accept", () => {
    const delaysSpanningAcceptPasswordHashMs = [0, 150, 300, 450, 600];
    for (const resendDelayMs of delaysSpanningAcceptPasswordHashMs) {
      it(`stays consistent with the resend delayed ${resendDelayMs}ms`, async () => {
        const { id, email, token } = await invite();

        const [accepted, resent] = await Promise.all([
          accept(token),
          Bun.sleep(resendDelayMs).then(() => resend(id)),
        ]);

        expect(accepted.status === 200 ? 404 : 200).toBe(resent.status);
        if (accepted.status === 200) {
          expect(resent.json<{ message: string }>()).toEqual(NOT_FOUND);
          expect(await accountsFor(email)).toHaveLength(1);
          expect(await pendingRow(id)).toBeUndefined();
          return;
        }

        expect(accepted.status).toBe(400);
        expect(accepted.json<{ message: string }>()).toEqual(INVALID_TOKEN);
        expect(await accountsFor(email)).toHaveLength(0);
        const link = firstLink(resent);
        expect((await accept(link.token)).status).toBe(200);
        expect(await accountsFor(email)).toHaveLength(1);
      });
    }
  });
});

const waitForBlockedUpdate = async () => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND query LIKE 'update "Invitations"%'`,
    );
    if (rows.length > 0) return;
    await Bun.sleep(25);
  }
  throw new Error("the correction never blocked on the rival Invitation");
};
