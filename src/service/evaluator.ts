import { db } from "../drizzle";
import { accounts, evaluators } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { NotFoundError, status } from "elysia";

const createEvaluatorHelper = (database: typeof db) => {
  return {
    getEvaluatorData: async (accountId: number) => {
      const result = await database
        .select({
          evaluator: evaluators,
        })
        .from(accounts)
        .leftJoin(evaluators, eq(accounts.id, evaluators.accountId))
        .where(eq(accounts.id, accountId))
        .then((res) => res[0]);

      if (!result || !result.evaluator) {
        return status(404, { message: "invalid evaluator" });
      }

      return result;
    },
  };
};

export const createEvaluatorService = (database: typeof db) => {
  const helper = createEvaluatorHelper(database);
  return {
    helper,
  };
};

export const evaluatorService = createEvaluatorService(db);
