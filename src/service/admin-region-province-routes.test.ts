import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Elysia } from "elysia";

type RouteEntry = {
  method: string;
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: Elysia does not export the type of a registered route's compiled hooks
  hooks?: { query?: any };
};

const ADMIN_ROUTES = [
  { name: "admins/factories", mod: "../routes/admins/factories/index" },
  { name: "admins/enrolls", mod: "../routes/admins/enrolls/index" },
  { name: "admins/score", mod: "../routes/admins/score/index" },
] as const;

const listRouteOf = async (modPath: string): Promise<RouteEntry> => {
  // biome-ignore lint/suspicious/noExplicitAny: route modules are typed against the concrete App instance
  const define = (await import(modPath)).default as (app: any) => any;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  const app = define(new Elysia() as any) as { routes: RouteEntry[] };
  const entry = app.routes.find((r) => r.method === "GET" && r.path === "");
  if (!entry) throw new Error(`no GET "" route registered by ${modPath}`);
  return entry;
};

describe("admin lists accept region and provinceId", () => {
  for (const route of ADMIN_ROUTES) {
    describe(route.name, () => {
      it("declares both params, optional, as numbers", async () => {
        const { hooks } = await listRouteOf(route.mod);
        const props = hooks?.query?.properties ?? {};
        const required: string[] = hooks?.query?.required ?? [];
        for (const key of ["region", "provinceId"]) {
          expect(Object.keys(props)).toContain(key);
          expect(required).not.toContain(key);
          expect(Value.Check(props[key], 5)).toBe(true);
          expect(Value.Check(props[key], "x")).toBe(false);
        }
      });
    });
  }

  it("the factory and enrollment params match the score list's", async () => {
    const score = (await listRouteOf("../routes/admins/score/index")).hooks?.query?.properties;
    for (const mod of ["../routes/admins/factories/index", "../routes/admins/enrolls/index"]) {
      const props = (await listRouteOf(mod)).hooks?.query?.properties;
      for (const key of ["region", "provinceId"]) {
        expect(JSON.stringify(props[key])).toEqual(JSON.stringify(score[key]));
      }
    }
  });
});
