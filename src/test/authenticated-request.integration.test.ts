import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts } from "../drizzle/schema";
import { Role } from "../service/authentication";
import {
  authenticatedRequest,
  removeAccount,
  seedEvaluatorAccount,
  signAccessToken,
} from "./authenticated-request";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[authenticated request integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const EVALUATOR_ID = 99935;
const NOT_AN_ADMIN_ID = 99936;
const AUTHENTICATION_ROUTE = "src/routes/authentication/index.ts";
const ADMIN_ROUTE = "src/routes/admins/index.ts";
const ADMIN_FINALIZE_ROUTE = "src/routes/admins/covers/[coverId]/finalize/index.ts";

describeDb("authenticated write requests", () => {
  let evaluatorToken: string;
  let evaluatorEmail: string;
  let adminToken: string;

  beforeAll(async () => {
    await removeAccount(db, EVALUATOR_ID);
    const evaluator = await seedEvaluatorAccount(db, { id: EVALUATOR_ID, region: 4 });
    evaluatorToken = await signAccessToken(evaluator);
    // The reset request throttles per email in Redis, so a run that fails midway must not block the
    // next one.
    evaluatorEmail = `test_rig_${crypto.randomUUID()}@test.com`;
    await db.update(accounts).set({ email: evaluatorEmail }).where(eq(accounts.id, EVALUATOR_ID));
    adminToken = await signAccessToken({
      id: NOT_AN_ADMIN_ID,
      username: "test_rig_admin",
      role: Role.DOED,
    });
  });

  afterAll(async () => {
    await removeAccount(db, EVALUATOR_ID);
    await pool.end();
  });

  it("refuses a wrong-role POST with 403 and queues nothing", async () => {
    const res = await authenticatedRequest(ADMIN_FINALIZE_ROUTE, {
      method: "POST",
      body: {},
      token: evaluatorToken,
    });

    expect(res.status).toBe(403);
    expect(res.queuedEmails).toEqual([]);
  });

  it("delivers a PATCH body through the guard to the route", async () => {
    const accepted = await authenticatedRequest(ADMIN_ROUTE, {
      method: "PATCH",
      body: { firstName: "ทดสอบ" },
      token: adminToken,
    });
    expect(accepted.status).toBe(400);
    expect(accepted.json<{ message: string }>().message).toBe("admin not found");

    const invalid = await authenticatedRequest(ADMIN_ROUTE, {
      method: "PATCH",
      body: { password: "short" },
      token: adminToken,
    });
    expect(invalid.status).toBe(422);
  });

  it("exposes a queued job so its token can be posted in a second request", async () => {
    const requested = await authenticatedRequest(AUTHENTICATION_ROUTE, {
      method: "POST",
      path: "/reset-password-request",
      body: { email: evaluatorEmail },
    });
    expect(requested.status).toBe(200);
    expect(requested.queuedEmails).toHaveLength(1);
    const [job] = requested.queuedEmails;
    expect(job?.name).toBe("password-reset-request");
    expect(job?.data.email).toBe(evaluatorEmail);

    const reset = await authenticatedRequest(AUTHENTICATION_ROUTE, {
      method: "POST",
      path: "/reset-password",
      body: { token: job?.data.token, password: "a-brand-new-password" },
    });
    expect(reset.status).toBe(200);
    expect(reset.json<{ message: string }>().message).toBe("password changed!");
  });
});
