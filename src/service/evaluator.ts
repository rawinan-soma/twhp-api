import { utilities } from "../utils";
import { status } from "elysia";
import { db } from "../drizzle";
import { accounts, enrolls, evaluators, factories, provinces } from "../drizzle/schema";
import { eq, getTableColumns, and, gte, lt, desc } from "drizzle-orm";

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
        throw status(400, { message: "evaluator not found" });
      }

      return result.evaluator;
    },
  };
};

export const createEvaluatorService = (database: typeof db) => {
  const helper = createEvaluatorHelper(database);
  return {
    helper,
    getEnrollsByEvalId: async (accountId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const evaluator = await helper.getEvaluatorData(accountId);
      const enrollList = await database
        .select({
          ...getTableColumns(enrolls),
          factory_name_th: factories.nameTh,
          region: provinces.healthRegion,
          provinceId: provinces.provinceId,
        })
        .from(enrolls)
        .leftJoin(factories, eq(enrolls.factoryId, factories.accountId))
        .leftJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(
          and(
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
            eq(provinces.healthRegion, evaluator.region),
          ),
        )
        .orderBy(desc(enrolls.enrollDate));

      return enrollList;
    },
  };
};

export const evaluatorService = createEvaluatorService(db);
