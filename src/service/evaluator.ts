import { utilities } from "../utils";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { db } from "../drizzle";
import {
  accounts,
  enrolls,
  evaluators,
  factories,
  provinces,
} from "../drizzle/schema";
import { eq, getTableColumns, and, gte, lt, desc } from "drizzle-orm";
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
    getEnrollsByEvalId: async (accountId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const evaluator = await helper.getEvaluatorData(accountId);

      if (!evaluator || evaluator.evaluator === null) {
        return status(400, { message: "evaluator not found" });
      }

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
            eq(provinces.healthRegion, evaluator.evaluator.region),
          ),
        )
        .orderBy(desc(enrolls.enrollDate));

      return enrollList;
    },
  };
};

export const evaluatorService = createEvaluatorService(db);
