import { db } from "../drizzle";
import { evaluators } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const createEvaluatorRepository = (database: typeof db) => ({
  findAllByRegion: async (region: number) => {
    return await database
      .select()
      .from(evaluators)
      .where(eq(evaluators.region, region));
  },
});
export const evaluatorRepository = createEvaluatorRepository(db);
