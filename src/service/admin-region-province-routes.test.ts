import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { listQuerySchema } from "../test/route-query";

const SCORE_LIST = "src/routes/admins/score/index.ts";
const FILTERED_LISTS = [
  "src/routes/admins/factories/index.ts",
  "src/routes/admins/enrolls/index.ts",
];
const PARAMS = ["region", "provinceId"] as const;

describe.each([...FILTERED_LISTS, SCORE_LIST])("%s query contract", (route) => {
  it("declares both params, optional, as numbers", async () => {
    const { properties, required = [] } = await listQuerySchema(route);
    for (const key of PARAMS) {
      const param = properties[key];
      if (!param) throw new Error(`${route} does not declare ${key}`);
      expect(required).not.toContain(key);
      expect(Value.Check(param, 5)).toBe(true);
      expect(Value.Check(param, "x")).toBe(false);
    }
  });
});

describe.each(FILTERED_LISTS)("%s matches the score list", (route) => {
  it("declares identical params", async () => {
    const score = (await listQuerySchema(SCORE_LIST)).properties;
    const { properties } = await listQuerySchema(route);
    for (const key of PARAMS) {
      expect(JSON.stringify(properties[key])).toEqual(JSON.stringify(score[key]));
    }
  });
});
