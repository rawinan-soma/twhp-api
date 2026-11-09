import { resolve } from "node:path";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import { adminGuard } from "../middleware/guards";
import { Role } from "../service/authentication";
import { signAccessToken } from "./authenticated-request";

export type Caller = "anonymous" | Role;
export type RouteObservation = { method: string; path: string; statuses: Record<Caller, number> };
export type AccessMatrix = {
  prefix: string;
  routes: RouteObservation[];
  pluginGuard: { guarded: number; sibling: number };
};

const prefix = "/twhp/api";

const callers: Caller[] = ["anonymous", Role.Factory, Role.Provincial, Role.Evaluator, Role.DOED];

const cookieFor = async (caller: Caller) =>
  caller === "anonymous"
    ? undefined
    : `Authentication=${await signAccessToken({ id: 1, username: `matrix_${caller}`, role: caller })}`;

// An empty multipart body is the one shape every write route parses without error. A missing
// body is rejected before the guard on the file-upload routes, and JSON on them is too.
const request = (method: string, path: string, cookie?: string) =>
  new Request(`http://localhost${path.replaceAll(/:[^/]+/g, "1")}`, {
    method,
    headers: cookie ? { cookie } : {},
    body: method === "GET" || method === "DELETE" ? undefined : new FormData(),
  });

// Autoload resolves a relative `dir` against the main script, so the real app's "./routes" is
// spelled from this file's location instead.
const app = new Elysia({ prefix }).use(
  await autoload({
    dir: resolve(import.meta.dir, "../routes"),
    ignore: ["**/*.test.ts", "**/*.spec.ts"],
  }),
);

const cookies = Object.fromEntries(
  await Promise.all(callers.map(async (caller) => [caller, await cookieFor(caller)])),
) as Record<Caller, string | undefined>;

const seen = new Set<string>();
const routes: RouteObservation[] = [];
for (const { method, path } of app.routes) {
  const key = `${method} ${path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const statuses = {} as Record<Caller, number>;
  for (const caller of callers) {
    statuses[caller] = (await app.handle(request(method, path, cookies[caller]))).status;
  }
  routes.push({ method, path, statuses });
}

const parent = new Elysia()
  .use(new Elysia().use(adminGuard).get("/admin", () => "ok"))
  .get("/sibling", () => "ok");
const evaluator = cookies[Role.Evaluator];
const pluginGuard = {
  guarded: (await parent.handle(request("GET", "/admin", evaluator))).status,
  sibling: (await parent.handle(request("GET", "/sibling", evaluator))).status,
};

process.stdout.write(JSON.stringify({ prefix, routes, pluginGuard } satisfies AccessMatrix));
process.exit(0);
