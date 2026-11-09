import { describe, expect, it } from "bun:test";
import { listQuerySchema } from "../test/route-query";

const EVALUATOR_LISTS = [
  "src/routes/evaluators/factories/index.ts",
  "src/routes/evaluators/enrolls/index.ts",
  "src/routes/evaluators/score/index.ts",
];

describe.each(EVALUATOR_LISTS)("%s query contract", (route) => {
  it("declares an optional provinceId", async () => {
    const query = await listQuerySchema(route);
    expect(Object.keys(query.properties)).toContain("provinceId");
    expect(query.required ?? []).not.toContain("provinceId");
  });

  it("does not declare region, so the region can only come from the account", async () => {
    const query = await listQuerySchema(route);
    expect(Object.keys(query.properties)).not.toContain("region");
  });
});
