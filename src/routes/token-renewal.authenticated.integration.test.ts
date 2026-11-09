import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts } from "../drizzle/schema";
import {
  authenticatedGet,
  removeAccount,
  seedEvaluatorAccount,
  signRefreshToken,
  type TestIdentity,
} from "../test/authenticated-request";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[token renewal integration] SKIPPED, no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const EVALUATOR_ID = 99972;
const EVALUATOR_REGION = 4;
const SESSION_ROUTE = "src/routes/authentication/index.ts";
const FULL_LIFETIME = Number(Bun.env.REFRESH_TOKEN_EXP);
const NEAR_EXPIRY = 60;

const hashOf = (token: string) => Bun.SHA256.hash(token, "hex");

const cookieValue = (setCookies: string[], name: string) =>
  setCookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    ?.slice(name.length + 1);

const storedHash = async () => {
  const [row] = await db
    .select({ hash: accounts.hashedRefreshToken })
    .from(accounts)
    .where(eq(accounts.id, EVALUATOR_ID));
  return row?.hash;
};

const storeRefreshToken = async (token: string) => {
  await db
    .update(accounts)
    .set({ hashedRefreshToken: hashOf(token) })
    .where(eq(accounts.id, EVALUATOR_ID));
};

describeDb("session token renewal", () => {
  let identity: TestIdentity;

  beforeEach(async () => {
    await removeAccount(db, EVALUATOR_ID);
    identity = await seedEvaluatorAccount(db, { id: EVALUATOR_ID, region: EVALUATOR_REGION });
  });

  afterAll(async () => {
    await removeAccount(db, EVALUATOR_ID);
    await pool.end();
  });

  it("issues a working access token from a refresh token alone", async () => {
    const refreshToken = await signRefreshToken(identity, FULL_LIFETIME);
    await storeRefreshToken(refreshToken);

    const renewed = await authenticatedGet(SESSION_ROUTE, { refreshToken });
    expect(renewed.status).toBe(200);
    expect(renewed.json<{ id: number; region: number | null }>()).toMatchObject({
      id: EVALUATOR_ID,
      username: identity.username,
      role: "Evaluator",
      region: EVALUATOR_REGION,
    });

    const token = cookieValue(renewed.setCookies, "Authentication");
    expect(token).toBeTruthy();
    const followUp = await authenticatedGet(SESSION_ROUTE, { token });
    expect(followUp.status).toBe(200);
    expect(followUp.json<{ id: number }>().id).toBe(EVALUATOR_ID);
  });

  it("keeps the refresh token while it has more than half its lifetime left", async () => {
    const refreshToken = await signRefreshToken(identity, FULL_LIFETIME);
    await storeRefreshToken(refreshToken);

    const renewed = await authenticatedGet(SESSION_ROUTE, { refreshToken });
    expect(renewed.status).toBe(200);
    expect(cookieValue(renewed.setCookies, "Refresh")).toBeUndefined();
    expect(await storedHash()).toBe(hashOf(refreshToken));
  });

  it("replaces a refresh token near expiry and rejects the old one", async () => {
    const refreshToken = await signRefreshToken(identity, NEAR_EXPIRY);
    await storeRefreshToken(refreshToken);

    const renewed = await authenticatedGet(SESSION_ROUTE, { refreshToken });
    expect(renewed.status).toBe(200);
    const replacement = cookieValue(renewed.setCookies, "Refresh");
    if (!replacement) throw new Error("no replacement Refresh cookie was set");
    expect(replacement).not.toBe(refreshToken);
    expect(await storedHash()).toBe(hashOf(replacement));

    const reused = await authenticatedGet(SESSION_ROUTE, { refreshToken });
    expect(reused.status).toBe(401);
  });

  it("rejects a refresh token the account does not hold", async () => {
    const stored = await signRefreshToken(identity, FULL_LIFETIME);
    await storeRefreshToken(stored);

    const stranger = await signRefreshToken(identity, FULL_LIFETIME + 1);
    const res = await authenticatedGet(SESSION_ROUTE, { refreshToken: stranger });
    expect(res.status).toBe(401);
    expect(res.json<{ message: string }>().message).toBe("session expired");
  });
});
