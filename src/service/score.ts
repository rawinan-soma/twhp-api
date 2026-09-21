import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { PgSelectQueryBuilder } from "drizzle-orm/pg-core";
import { status } from "elysia";
import { db } from "../drizzle";
import { answers, covers, enrolls, factories, provinces, questions } from "../drizzle/schema";
import { buildPage, type PaginationQueryDto, resolvePage } from "../schema/pagination";
import { utilities } from "../utils";
import { latestCoverLogFor, latestCoverLogLateral } from "./coverStatus";
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

/** A Cover is scorable once it leaves `in_progress`. See docs/adr/0011. */
const SCORABLE_STATUSES = ["in_review", "finished"] as const;

export const createScoreService = (database: typeof db) => {
  /**
   * Shared join chain for the Score Report list reads. Both the count query and the page query are
   * built from it, so their predicates cannot drift and `meta.total` always describes the same
   * population as `items`.
   *
   * Cover status arrives through the shared lateral (docs/adr/0010) — this service must never
   * derive it itself.
   */
  const withScoreJoins = <Q extends PgSelectQueryBuilder>(
    query: Q,
    latest: ReturnType<typeof latestCoverLogLateral>,
  ) =>
    query
      .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
      .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
      .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
      .leftJoinLateral(latest, sql`true`);

  /**
   * Total order for the Score Report lists.
   *
   * These queries previously had NO `ORDER BY` at all, so their row order was undefined — offset
   * pagination over that is meaningless rather than merely unstable. `accountId` matches the
   * ordering the factory lists use; `covers.id` is a defensive tiebreaker, because `accountId`'s
   * uniqueness here follows from business rules rather than a database constraint.
   */
  const scoreListOrder = [asc(factories.accountId), asc(covers.id)] as const;

  /**
   * Phase 2 of the two-phase read (docs/adr/0011).
   *
   * A LOOKUP, never a filter. It may not add or remove an item that phase 1 already chose — which
   * is why the result is a Map with an empty-array default at the call site rather than a join.
   * A scorable Cover with zero Answers must still produce a report with an empty breakdown.
   *
   * `coverIds` is the PAGE's ids only. Passing the unpaginated population here would reinstate the
   * ~123,000-row fan-out this bolt exists to remove.
   */
  const hydrateAnswers = async (coverIds: number[]) => {
    const byCover = new Map<number, AnswerWithCategory[]>();
    if (coverIds.length === 0) return byCover;

    const rows = await database
      .select({
        coverId: answers.coverId,
        selectedChoice: answers.selectedChoice,
        category: questions.category,
        special: questions.special,
      })
      .from(answers)
      .innerJoin(questions, eq(questions.id, answers.questionId))
      .where(inArray(answers.coverId, coverIds));

    for (const row of rows) {
      const bucket = byCover.get(row.coverId) ?? [];
      bucket.push({
        selectedChoice: row.selectedChoice,
        category: row.category as CategoryKey,
        special: row.special,
      });
      byCover.set(row.coverId, bucket);
    }
    return byCover;
  };

  /**
   * Compute one Score Report. The scoring rules themselves are untouched by this bolt — only the
   * size of their input changed.
   *
   * `grade` is non-null only for a `finished` Cover, per intent 011-finished-cover-reward-guard.
   */
  const toScoreReport = (
    cover: CoverWithFactoryInfo & { coverStatus: string },
    coverAnswers: AnswerWithCategory[],
  ) => {
    const scoring = calculateBreakdown(coverAnswers);
    return {
      factoryId: cover.factoryId,
      factoryNameTh: cover.factoryNameTh,
      coverId: cover.coverId,
      coverStatus: cover.coverStatus,
      enrollId: cover.enrollId,
      grade: cover.coverStatus === "finished" ? computeGrade(scoring, coverAnswers) : null,
      scoring,
    };
  };

  /**
   * Shared implementation behind the three staff Score Report lists. They differ only in scope, so
   * a single implementation is what keeps their count and page predicates identical.
   */
  const listScoreReports = async ({
    region,
    provinceId,
    fiscalYear,
    page,
    limit,
  }: { region?: number; provinceId?: number; fiscalYear?: number } & PaginationQueryDto) => {
    const {
      fiscalYear: resolvedFiscalYear,
      fiscalYearStart,
      fiscalYearEnd,
    } = utilities().getFiscalYear(fiscalYear);
    const resolved = resolvePage({ page, limit });
    const latest = latestCoverLogLateral(database);

    const predicate = and(
      gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
      lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
      region === undefined ? undefined : eq(provinces.healthRegion, region),
      provinceId === undefined ? undefined : eq(provinces.provinceId, provinceId),
      // Scorable filter in SQL, not JavaScript — this is what makes `total` correct.
      inArray(latest.status, [...SCORABLE_STATUSES]),
    );

    // Phase 1 — paginate the aggregate root.
    const [total, coverPage] = await Promise.all([
      withScoreJoins(database.select({ value: count() }).from(covers).$dynamic(), latest)
        .where(predicate)
        .then((rows) => rows[0]?.value ?? 0),
      withScoreJoins(
        database
          .select({
            coverId: covers.id,
            enrollId: covers.enrollId,
            factoryId: factories.accountId,
            factoryNameTh: factories.nameTh,
            coverStatus: latest.status,
          })
          .from(covers)
          .$dynamic(),
        latest,
      )
        .where(predicate)
        .orderBy(...scoreListOrder)
        .limit(resolved.limit)
        .offset(resolved.offset),
    ]);

    // Phase 2 — hydrate ONLY the page, then compute.
    const answersByCover = await hydrateAnswers(coverPage.map((c) => c.coverId));
    const items = coverPage.map((c) =>
      toScoreReport(
        { ...c, coverStatus: c.coverStatus as string },
        answersByCover.get(c.coverId) ?? [],
      ),
    );

    const withFiscalYear = items.map((item) => ({ ...item, fiscalYear: resolvedFiscalYear }));

    return buildPage(withFiscalYear, total, resolved.page, resolved.limit);
  };

  return {
    getScoreByFactory: async (factoryId: number, fiscalYear?: number) => {
      const {
        fiscalYear: resolvedFiscalYear,
        fiscalYearStart,
        fiscalYearEnd,
      } = utilities().getFiscalYear(fiscalYear);

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

      // Shape B of the shared latest-log-wins resolution. This service must not derive current
      // status itself — see the Amendment section of docs/adr/0010.
      const coverStatus = (await latestCoverLogFor(database, coverRow.coverId)) ?? "in_progress";
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
        fiscalYear: resolvedFiscalYear,
        grade,
        scoring,
      };
    },

    getScoresByRegion: async (
      region: number,
      pagination?: PaginationQueryDto & { fiscalYear?: number },
    ) => listScoreReports({ region, ...pagination }),

    getScoresByProvince: async (
      provinceId: number,
      pagination?: PaginationQueryDto & { fiscalYear?: number },
    ) => listScoreReports({ provinceId, ...pagination }),

    getAllScores: async (
      filters?: { region?: number; provinceId?: number },
      pagination?: PaginationQueryDto & { fiscalYear?: number },
    ) => listScoreReports({ ...filters, ...pagination }),
  };
};

export const scoreService = createScoreService(db);
