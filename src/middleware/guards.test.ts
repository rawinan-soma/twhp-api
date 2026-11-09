import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { Role } from "../service/authentication";
import type { AccessMatrix, Caller } from "../test/route-access-matrix";

const roles = [
  "Factory",
  "Provincial",
  "Evaluator",
  "DOED",
] as const satisfies readonly `${Role}`[];
type RoleName = (typeof roles)[number];
type Access = "public" | "authenticated" | RoleName;

const exact: Record<string, Access> = {
  "GET /health": "public",
  "GET /location/provinces": "public",
  "GET /location/provinces/:provinceId/districts": "public",
  "GET /location/districts/:districtId/subdistricts": "public",
  "POST /factories/register": "public",
  "POST /authentication/login": "public",
  "POST /authentication/login/verify-otp": "public",
  "POST /authentication/login/resend-otp": "public",
  "POST /authentication/reset-password-request": "public",
  "POST /authentication/reset-password": "public",
  "GET /authentication": "authenticated",
  "POST /authentication/logout": "authenticated",
  "GET /file/presigned-url": "authenticated",
};

const byPrefix: Record<string, RoleName> = {
  "/admins": "DOED",
  "/evaluators": "Evaluator",
  "/provincialOfficers": "Provincial",
  "/factories": "Factory",
};

const accessOf = (method: string, path: string): Access | undefined => {
  const route = `${method} ${path}`;
  if (route in exact) return exact[route];
  return Object.entries(byPrefix).find(
    ([prefix]) => path === prefix || path.startsWith(`${prefix}/`),
  )?.[1];
};

type Outcome = "401" | "403" | "past the guard";
const outcome = (status: number): Outcome =>
  status === 401 || status === 403 ? (String(status) as Outcome) : "past the guard";

const expectedOutcomes = (access: Access): Record<Caller, Outcome> => {
  const forRole = (role: RoleName): Outcome => {
    if (access === "public" || access === "authenticated") return "past the guard";
    return role === access ? "past the guard" : "403";
  };
  return {
    anonymous: access === "public" ? "past the guard" : "401",
    ...(Object.fromEntries(roles.map((role) => [role, forRole(role)])) as Record<
      RoleName,
      Outcome
    >),
  };
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

/**
 * Runs in a child process for the same reason as `authenticatedGet`: other test files `mock.module`
 * config, utils and the database client, and Bun never restores them.
 */
const observe = async (): Promise<AccessMatrix> => {
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

const matrix = await observe();
const unprefixed = (path: string) => path.slice(matrix.prefix.length);

describe("role guards on every autoloaded route", () => {
  const unmatched = matrix.routes
    .filter(({ method, path }) => accessOf(method, unprefixed(path)) === undefined)
    .map(({ method, path }) => `${method} ${path}`);

  test("every registered route has an access policy", () => {
    expect(matrix.routes.length).toBeGreaterThan(0);
    expect(unmatched).toEqual([]);
  });

  for (const { method, path, statuses } of matrix.routes) {
    const access = accessOf(method, unprefixed(path));
    if (access === undefined) continue;
    test(`${access}: ${method} ${path}`, () => {
      const observed = Object.fromEntries(
        Object.entries(statuses).map(([caller, status]) => [caller, outcome(status)]),
      );
      expect(observed).toEqual(expectedOutcomes(access));
    });
  }
});

test("a guard mounted in a plugin instance leaves the parent's sibling route alone", () => {
  expect(matrix.pluginGuard).toEqual({ guarded: 403, sibling: 200 });
});
