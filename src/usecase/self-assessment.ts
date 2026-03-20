import { coverRepository } from "../repository/cover";
import { enrollRepository } from "../repository/enroll";
import { utilities } from "../utils";
import type { CreateAnswerDto } from "../schema/answer";
import { answerRepository } from "../repository/answer";
import { questionRepository } from "../repository/question";
import { status } from "elysia";

export const createSelfAssessmentUsecase = (
  cover: typeof coverRepository,
  enroll: typeof enrollRepository,
  answer: typeof answerRepository,
  question: typeof questionRepository,
) => {
  return {
    createCover: async (factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const enrollId = await enroll
        .findOneByFactoryId(factoryId, fiscalYearStart, fiscalYearEnd)
        .then((res) => res.id);

      if (!enrollId) {
        throw status(400, { message: "enroll not found" });
      }

      await cover.create(enrollId);
    },

    createAnswer: async (factoryId: number, dto: CreateAnswerDto) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const enrollId = (
        await enroll.findOneByFactoryId(
          factoryId,
          fiscalYearStart,
          fiscalYearEnd,
        )
      ).id;

      if (!enrollId) {
        throw status(400, { message: "enroll not found" });
      }

      const coverId = (await cover.findOneByEnrollId(enrollId)).id;

      await answer.create(dto, coverId);
    },

    getAllQuestions: async () => {
      return await question.findAll();
    },
  };
};

export const selfAssessmentUsecase = createSelfAssessmentUsecase(
  coverRepository,
  enrollRepository,
  answerRepository,
  questionRepository,
);
