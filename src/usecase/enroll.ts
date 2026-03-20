import { enrollRepository } from "../repository/enroll";
import { utilities } from "../utils";
import { evaluatorRepository } from "../repository/evaluator";
import { status } from "elysia";
import { CreateEnrollDto } from "../schema/enroll";

const createEnrollHelper = (enroll: typeof enrollRepository) => {
  return {
    getEnrollByFactoryId: async (factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const selectedEnroll = await enroll.findOneByFactoryId(
        factoryId,
        fiscalYearStart,
        fiscalYearEnd,
      );

      return selectedEnroll;
    },
  };
};

export const createEnrollUsecase = (
  enroll: typeof enrollRepository,
  evaluator: typeof evaluatorRepository,
) => {
  const helper = createEnrollHelper(enroll);
  return {
    getAllEnrolls: async () => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const results = await enroll.findAllByEnrollDate(
        fiscalYearStart,
        fiscalYearEnd,
      );

      return results;
    },

    getAllEnrollsByRegion: async (region: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const results = await enroll.findAllByEnrollDate(
        fiscalYearStart,
        fiscalYearEnd,
      );

      return results.filter((res) => res.region === region);
    },

    getEnrollById: async (enrollId: number) => {
      const result = await enroll.findOneByEnrollId(enrollId);

      if (!result) {
        throw status(400, { message: "enroll not found" });
      }

      return {
        ...result.enrolls,
        province_name_th: result.Provinces?.nameTh,
        district_name_th: result.Districts?.nameTh,
        subdistrict_name_th: result.Subdistricts?.nameTh,
      };
    },

    getEnrollByFactoryId: async (factoryId: number) => {
      const result = await helper.getEnrollByFactoryId(factoryId);

      if (!result) {
        throw status(400, { message: "enrollment not found" });
      }

      return result;
    },

    create: async (dto: CreateEnrollDto, factoryId: number) => {
      const evaluators = await evaluator.findAllByRegion(factoryId);
      if (evaluators.length === 0) {
        throw status(400, { message: "evaluators not found" });
      }

      const extractedEvaluators = {
        evalDoh: evaluators.filter((evaluator) => evaluator.level === "DOH")[0],
        evalMental: evaluators.filter(
          (evaluator) => evaluator.level === "Mental",
        )[0],
        evalOdpc: evaluators.filter(
          (evaluator) => evaluator.level === "ODPC",
        )[0],
      };

      const existingEnroll = await helper.getEnrollByFactoryId(factoryId);
      if (existingEnroll) {
        throw status(400, {
          message: "already make an enroll in fiscal year",
        });
      }

      await enroll.create(
        dto,
        factoryId,
        extractedEvaluators.evalMental.accountId,
        extractedEvaluators.evalOdpc.accountId,
        extractedEvaluators.evalDoh.accountId,
      );

      return {
        message: "create enrollment successfully",
      };
    },
  };
};

export const enrollUsecase = createEnrollUsecase(
  enrollRepository,
  evaluatorRepository,
);
