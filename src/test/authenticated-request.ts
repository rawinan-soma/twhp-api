import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { SignJWT } from "jose";
import { accounts, evaluators, provincialOfficers } from "../drizzle/schema";
import type { Role } from "../service/authentication";

export type TestIdentity = { id: number; username: string; role: Role };

export const signAccessToken = ({ id, username, role }: TestIdentity) =>
  new SignJWT({ username, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id.toString())
    .setIssuedAt()
    .setExpirationTime(`${Bun.env.AUTH_TOKEN_EXP}s`)
    .sign(new TextEncoder().encode(Bun.env.AUTH_JWT_SECRET ?? ""));

export const signRefreshToken = ({ id }: TestIdentity, expiresInSeconds: number) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id.toString())
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(new TextEncoder().encode(Bun.env.REFRESH_JWT_SECRET ?? ""));

type Query = Record<string, string | number | boolean | undefined>;

const RUNNER = resolve(import.meta.dir, "handle-request.ts");

/**
 * Runs in a child process because other test files call `mock.module` on config, utils and the
 * database client, and Bun never restores those between files, so an in-process app would see
 * their stubs.
 */
export const authenticatedGet = async (
  routeModule: string,
  options: { token?: string; refreshToken?: string; query?: Query; path?: string } = {},
) => {
  const url = new URL(options.path ?? "/", "http://localhost");
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const child = Bun.spawn(
    [
      "bun",
      RUNNER,
      JSON.stringify({
        routeModule,
        url: url.href,
        token: options.token,
        refreshToken: options.refreshToken,
      }),
    ],
    { stdout: "pipe", stderr: "pipe", env: process.env },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`request runner exited ${code}: ${err}`);
  const { status, body, setCookies } = JSON.parse(out) as {
    status: number;
    body: string;
    setCookies: string[];
  };
  return { status, body, setCookies, json: <T>() => JSON.parse(body) as T };
};

export const seedEvaluatorAccount = async (
  database: NodePgDatabase,
  evaluator: { id: number; region: number; level?: "Mental" | "DOH" | "ODPC" },
) => {
  const username = `test_auth_eval_${evaluator.id}`;
  await database.insert(accounts).values({
    id: evaluator.id,
    username,
    password: "hashed",
    email: `${username}@test.com`,
    role: "Evaluator",
  });
  await database.insert(evaluators).values({
    accountId: evaluator.id,
    level: evaluator.level ?? "ODPC",
    firstName: "ทดสอบ",
    lastName: "ทดสอบ",
    region: evaluator.region,
    phoneNumber: "0000000000",
  });
  return { id: evaluator.id, username, role: "Evaluator" as Role };
};

export const seedAdminAccount = async (database: NodePgDatabase, admin: { id: number }) => {
  const username = `test_auth_admin_${admin.id}`;
  await database.insert(accounts).values({
    id: admin.id,
    username,
    password: "hashed",
    email: `${username}@test.com`,
    role: "DOED",
  });
  return { id: admin.id, username, role: "DOED" as Role };
};

export const seedProvincialOfficerAccount = async (
  database: NodePgDatabase,
  officer: { id: number; provinceId: number },
) => {
  const username = `test_auth_officer_${officer.id}`;
  await database.insert(accounts).values({
    id: officer.id,
    username,
    password: "hashed",
    email: `${username}@test.com`,
    role: "Provincial",
  });
  await database.insert(provincialOfficers).values({
    accountId: officer.id,
    firstName: "ทดสอบ",
    lastName: "ทดสอบ",
    phoneNumber: "0000000000",
    provinceId: officer.provinceId,
  });
  return { id: officer.id, username, role: "Provincial" as Role };
};

export const removeProvincialOfficerAccount = async (database: NodePgDatabase, id: number) => {
  await database.delete(provincialOfficers).where(eq(provincialOfficers.accountId, id));
  await removeAccount(database, id);
};

export const removeAccount = async (database: NodePgDatabase, id: number) => {
  await database.delete(accounts).where(eq(accounts.id, id));
};
