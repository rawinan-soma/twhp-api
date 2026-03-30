import { db } from "../drizzle";
import { accounts, evaluators } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcrypt";

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
