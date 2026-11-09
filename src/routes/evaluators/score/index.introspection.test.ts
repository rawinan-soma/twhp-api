import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

type RouteEntry = {
  method: string;
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: Elysia does not export the type of a registered route's compiled hooks
  hooks?: { query?: any };
};

const listRoute = async () => {
  // biome-ignore lint/suspicious/noExplicitAny: route modules are typed against the concrete App instance
  const define = (await import("./index")).default as (app: any) => any;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  const app = define(new Elysia() as any) as { routes: RouteEntry[] };
  const entry = app.routes.find((r) => r.method === "GET" && r.path === "");
  if (!entry) throw new Error("no GET route registered by the evaluator score list");
  return entry;
};

describe("evaluator score list query contract", () => {
  it("declares an optional provinceId", async () => {
    const { hooks } = await listRoute();
    expect(Object.keys(hooks?.query?.properties ?? {})).toContain("provinceId");
    expect(hooks?.query?.required ?? []).not.toContain("provinceId");
  });

  it("does not declare region, so the region can only come from the account", async () => {
    const { hooks } = await listRoute();
    expect(Object.keys(hooks?.query?.properties ?? {})).not.toContain("region");
  });
});
