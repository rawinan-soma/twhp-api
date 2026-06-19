import { and, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { status } from "elysia";
import { db } from "../drizzle";
import {
  answers,
  coverLogs,
  covers,
  enrolls,
  factories,
  provinces,
  questions,
} from "../drizzle/schema";
import { utilities } from "../utils";
import {
  type AnswerWithCategory,
  type CategoryKey,
  calculateBreakdown,
  computeGrade,
} from "./scoreHelpers";

export { calculateBreakdown, computeGrade, scoreGroup } from "./scoreHelpers";

type CoverWithFactoryInfo = {
  coverId: number;
  enrollId: number;
  factoryId: number;
  factoryNameTh: string;
};

export const createScoreService = (database: typeof db) => {
  const buildScoreReports = async (coverList: CoverWithFactoryInfo[]) => {
    const coverIds = coverList.map((c) => c.coverId);

    const latestStatuses = await database
      .selectDistinctOn([coverLogs.coverId], {
        coverId: coverLogs.coverId,
        status: coverLogs.status,
      })
      .from(coverLogs)
      .where(inArray(coverLogs.coverId, coverIds))
      .orderBy(coverLogs.coverId, desc(coverLogs.id));

    const statusMap = new Map(latestStatuses.map((s) => [s.coverId, s.status]));
    const readyCovers = coverList.filter((c) => {
      const s = statusMap.get(c.coverId);
      return s === "in_review" || s === "finished";
    });

    if (readyCovers.length === 0) return [];

    const readyCoverIds = readyCovers.map((c) => c.coverId);
    const allAnswers = await database
      .select({
        coverId: answers.coverId,
        selectedChoice: answers.selectedChoice,
        category: questions.category,
        special: questions.special,
      })
      .from(answers)
      .innerJoin(questions, eq(questions.id, answers.questionId))
      .where(inArray(answers.coverId, readyCoverIds));

    const answersByCover = new Map<number, AnswerWithCategory[]>();
    for (const a of allAnswers) {
      const arr = answersByCover.get(a.coverId) ?? [];
      arr.push({
        selectedChoice: a.selectedChoice,
        category: a.category as CategoryKey,
        special: a.special,
      });
      answersByCover.set(a.coverId, arr);
    }

    return readyCovers.map((c) => {
      const coverAnswers = answersByCover.get(c.coverId) ?? [];
      const coverStatus = statusMap.get(c.coverId) as string;
      const scoring = calculateBreakdown(coverAnswers);
      const grade = coverStatus === "finished" ? computeGrade(scoring, coverAnswers) : null;
      return {
        factoryId: c.factoryId,
        factoryNameTh: c.factoryNameTh,
        coverId: c.coverId,
        coverStatus,
        enrollId: c.enrollId,
        grade,
        scoring,
      };
    });
  };

  return {
    getScoreByFactory: async (factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const coverRow = await database
        .select({
          coverId: covers.id,
          enrollId: covers.enrollId,
          factoryId: factories.accountId,
          factoryNameTh: factories.nameTh,
        })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!coverRow) return status(404, { message: "cover not found" });

      const latestLog = await database
        .select({ status: coverLogs.status })
        .from(coverLogs)
        .where(eq(coverLogs.coverId, coverRow.coverId))
        .orderBy(desc(coverLogs.id))
        .limit(1)
        .then((res) => res[0]);

      const coverStatus = latestLog?.status ?? "in_progress";
      if (coverStatus === "in_progress") {
        return status(400, { message: "cover is not ready for scoring" });
      }

      const answerRows = await database
        .select({
          coverId: answers.coverId,
          selectedChoice: answers.selectedChoice,
          category: questions.category,
          special: questions.special,
        })
        .from(answers)
        .innerJoin(questions, eq(questions.id, answers.questionId))
        .where(eq(answers.coverId, coverRow.coverId));

      const mappedAnswers = answerRows.map((a) => ({
        ...a,
        category: a.category as CategoryKey,
      }));
      const scoring = calculateBreakdown(mappedAnswers);
      const grade = coverStatus === "finished" ? computeGrade(scoring, mappedAnswers) : null;

      return {
        factoryId: coverRow.factoryId,
        factoryNameTh: coverRow.factoryNameTh,
        coverId: coverRow.coverId,
        coverStatus,
        enrollId: coverRow.enrollId,
        grade,
        scoring,
      };
    },

    getScoresByRegion: async (region: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const coverList = await database
        .select({
          coverId: covers.id,
          enrollId: covers.enrollId,
          factoryId: factories.accountId,
          factoryNameTh: factories.nameTh,
        })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
        .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(
          and(
            eq(provinces.healthRegion, region),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        );

      if (coverList.length === 0) return [];
      return buildScoreReports(coverList);
    },

    getScoresByProvince: async (provinceId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const coverList = await database
        .select({
          coverId: covers.id,
          enrollId: covers.enrollId,
          factoryId: factories.accountId,
          factoryNameTh: factories.nameTh,
        })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
        .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(
          and(
            eq(provinces.provinceId, provinceId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        );

      if (coverList.length === 0) return [];
      return buildScoreReports(coverList);
    },

    getAllScores: async (filters?: { region?: number; provinceId?: number }) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const conditions: (SQL | undefined)[] = [
        gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
        lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
      ];
      if (filters?.region !== undefined)
        conditions.push(eq(provinces.healthRegion, filters.region));
      if (filters?.provinceId !== undefined)
        conditions.push(eq(provinces.provinceId, filters.provinceId));

      const coverList = await database
        .select({
          coverId: covers.id,
          enrollId: covers.enrollId,
          factoryId: factories.accountId,
          factoryNameTh: factories.nameTh,
        })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
        .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(and(...conditions));

      if (coverList.length === 0) return [];
      return buildScoreReports(coverList);
    },
  };
};

export const scoreService = createScoreService(db);
