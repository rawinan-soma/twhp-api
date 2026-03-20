import { accountRepository } from "../repository/account";
import { enrollRepository } from "../repository/enroll";
import { utilities } from "../utils";
import { factoryRepository } from "../repository/factory";
import { status } from "elysia";

const createEvaluatorHelper = (account: typeof accountRepository) => {
  return {
    getEvaluatorData: async (accountId: number) => {
      const result = await account.findOneById(accountId);

      if (!result || !result.evaluator) {
        throw status(400, { message: "evaluator not found" });
      }

      return result.evaluator;
    },
  };
};

export const createEvaluatorUsecase = (
  account: typeof accountRepository,
  enroll: typeof enrollRepository,

  factory: typeof factoryRepository,
) => {
  const helper = createEvaluatorHelper(account);
  return {
    helper,
    getEnrollsByEvalId: async (accountId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const evaluator = await helper.getEvaluatorData(accountId);
      const enrolls = await enroll.findAllByEnrollDate(
        fiscalYearStart,
        fiscalYearEnd,
      );

      const factoryInRegion = (
        await factory.findAll({
          validated: true,
          enrolled: true,
          provinceId: undefined,
          region: evaluator?.region,
          start: fiscalYearStart,
          end: fiscalYearEnd,
        })
      ).map((f) => f.Factories.accountId);

      const results = enrolls.filter((enroll) =>
        new Set(factoryInRegion).has(enroll.factoryId),
      );

      return results;
    },
  };
};

export const evaluatorUsecase = createEvaluatorUsecase(
  accountRepository,
  enrollRepository,
  factoryRepository,
);
