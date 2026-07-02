import { and, desc, eq, inArray } from "drizzle-orm";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { db } from "../drizzle";
import {
  answerLogs,
  answers,
  coverLogs,
  covers,
  enrolls,
  factories,
  provinces,
  type questionCategories,
  questions,
} from "../drizzle/schema";

import { emailQueue } from "../queue/email";
import type { VerdictBatch, VerdictSaveBody } from "../schema/evaluator-review";
import { utilities } from "../utils";
import { categoriesFor, type EvaluatorLevel, evaluatorService } from "./evaluator";
import { type CategoryKey, calculateBreakdown, computeGrade } from "./scoreHelpers";

type QuestionCategory = (typeof questionCategories.enumValues)[number];

/**
 * The resolved actor performing a review, decoupled from how it authenticated.
 * `region: null` denotes a national (admin) reviewer that bypasses the region gate.
 */
export type ReviewerContext = {
  accountId: number;
  level: EvaluatorLevel;
  region: number | null;
};

/** A DOED admin always reviews as a national ODPC. */
export const adminReviewerContext = (accountId: number): ReviewerContext => ({
  accountId,
  level: "ODPC",
  region: null,
});

const createEvaluatorReviewHelper = (database: typeof db) => {
  const assertCoverInRegion = async (coverId: number, region: number) => {
    const row = await database
      .select({ coverId: covers.id })
      .from(covers)
      .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
      .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
      .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
      .where(and(eq(covers.id, coverId), eq(provinces.healthRegion, region)))
      .limit(1)
      .then((r) => r[0]);

    if (!row) return status(404, { message: "cover not found" });
    return row;
  };

  const assertCoverExists = async (coverId: number) => {
    const row = await database
      .select({ coverId: covers.id })
      .from(covers)
      .where(eq(covers.id, coverId))
      .limit(1)
      .then((r) => r[0]);

    if (!row) return status(404, { message: "cover not found" });
    return row;
  };

  /** Region-aware cover access: national (region null) → existence only. */
  const assertCoverAccess = async (coverId: number, region: number | null) =>
    region === null ? assertCoverExists(coverId) : assertCoverInRegion(coverId, region);

  return { assertCoverInRegion, assertCoverExists, assertCoverAccess };
};

export const createEvaluatorReviewService = (database: typeof db) => {
  const helper = createEvaluatorReviewHelper(database);

  /**
   * Resolve an evaluator caller into a ReviewerContext (level + region).
   * Returns the 404 status response from getEvaluatorData if the caller is not an evaluator.
   */
  const resolveEvaluator = async (callerId: number) => {
    const evaluatorData = await evaluatorService.helper.getEvaluatorData(callerId);
    if (evaluatorData instanceof ElysiaCustomStatusResponse) return evaluatorData;
    // biome-ignore lint/style/noNonNullAssertion: guaranteed non-null after getEvaluatorData
    const evaluator = evaluatorData.evaluator!;
    return { accountId: evaluator.accountId, level: evaluator.level, region: evaluator.region };
  };

  return {
    resolveEvaluator,

    getAnswers: async (coverId: number, reviewer: ReviewerContext) => {
      const coverCheck = await helper.assertCoverAccess(coverId, reviewer.region);
      if (coverCheck instanceof ElysiaCustomStatusResponse) return coverCheck;

      const categories = categoriesFor(reviewer.level);

      const filteredAnswers = await database
        .select({
          answerId: answers.id,
          questionId: answers.questionId,
          category: questions.category,
          selectedChoice: answers.selectedChoice,
          fileUrl1_1: answers.fileUrl1_1,
          fileUrl1_2: answers.fileUrl1_2,
          fileUrl1_3: answers.fileUrl1_3,
          fileUrl2_1: answers.fileUrl2_1,
          fileUrl2_2: answers.fileUrl2_2,
          fileUrl2_3: answers.fileUrl2_3,
          fileUrl3_1: answers.fileUrl3_1,
          fileUrl3_2: answers.fileUrl3_2,
          fileUrl3_3: answers.fileUrl3_3,
        })
        .from(answers)
        .innerJoin(questions, eq(questions.id, answers.questionId))
        .where(
          and(
            eq(answers.coverId, coverId),
            inArray(questions.category, categories as QuestionCategory[]),
          ),
        );

      if (filteredAnswers.length === 0) return [];

      const answerIds = filteredAnswers.map((a) => a.answerId);

      const latestLogs = await database
        .selectDistinctOn([answerLogs.answerId], {
          answerId: answerLogs.answerId,
          status: answerLogs.status,
          verdictChoice: answerLogs.verdictChoice,
          description: answerLogs.description,
        })
        .from(answerLogs)
        .where(inArray(answerLogs.answerId, answerIds))
        .orderBy(answerLogs.answerId, desc(answerLogs.id));

      const logMap = new Map(latestLogs.map((l) => [l.answerId, l]));

      return filteredAnswers.map((a) => {
        const log = logMap.get(a.answerId);
        return {
          answerId: a.answerId,
          questionId: a.questionId,
          category: a.category as string,
          status: log?.status ?? "in_review",
          selectedChoice: a.selectedChoice,
          latestVerdictChoice: log?.verdictChoice ?? null,
          latestDescription: log?.description ?? null,
          fileUrl1_1: a.fileUrl1_1,
          fileUrl1_2: a.fileUrl1_2,
          fileUrl1_3: a.fileUrl1_3,
          fileUrl2_1: a.fileUrl2_1,
          fileUrl2_2: a.fileUrl2_2,
          fileUrl2_3: a.fileUrl2_3,
          fileUrl3_1: a.fileUrl3_1,
          fileUrl3_2: a.fileUrl3_2,
          fileUrl3_3: a.fileUrl3_3,
        };
      });
    },

    /**
     * Per-Answer verdict save (ADR-0005). Appends exactly one answerLogs row for a single
     * Answer with no side effects — no MinIO I/O, no coverLogs transition, no email.
     * `approve` writes `recommended` for EVERY level (tier-1 and ODPC); only finalize
     * writes `finished`. Editing is re-saving, gated by the authorship-keyed guard.
     */
    saveAnswerVerdict: async (
      coverId: number,
      answerId: number,
      reviewer: ReviewerContext,
      entry: VerdictSaveBody,
    ) => {
      const { accountId, level, region } = reviewer;

      const coverCheck = await helper.assertCoverAccess(coverId, region);
      if (coverCheck instanceof ElysiaCustomStatusResponse) return coverCheck;

      // Answer must exist within this Cover
      const answerRow = await database
        .select({
          answerId: answers.id,
          category: questions.category,
          selectedChoice: answers.selectedChoice,
        })
        .from(answers)
        .innerJoin(questions, eq(questions.id, answers.questionId))
        .where(and(eq(answers.coverId, coverId), eq(answers.id, answerId)))
        .limit(1)
        .then((r) => r[0]);

      if (!answerRow) {
        return status(400, { message: "answer not found in this cover" });
      }

      // Category scope — hard server-side guard
      const categories = categoriesFor(level);
      if (!categories.includes(answerRow.category as string)) {
        return status(403, { message: "answer is outside your category scope" });
      }

      // Current state = latest log (status + author) for the authorship-keyed edit guard
      const latest = await database
        .selectDistinctOn([answerLogs.answerId], {
          answerId: answerLogs.answerId,
          status: answerLogs.status,
          evalId: answerLogs.eval_id,
        })
        .from(answerLogs)
        .where(eq(answerLogs.answerId, answerId))
        .orderBy(answerLogs.answerId, desc(answerLogs.id))
        .then((r) => r[0]);

      const currentStatus = latest?.status ?? "in_review";
      const currentAuthor = latest?.evalId ?? null;

      // Edit guard (ADR-0005): finished → nobody; recommended → author or ODPC;
      // rejected / in_review → any category-scoped reviewer (already checked above).
      if (currentStatus === "finished") {
        return status(400, { message: `answer ${answerId} is already finalized` });
      }
      if (currentStatus === "recommended" && level !== "ODPC" && currentAuthor !== accountId) {
        return status(403, {
          message: `answer ${answerId} is recommended; only its author or ODPC can override`,
        });
      }

      // A change_score to the factory's current choice is a no-op — reject it; use "approve".
      if (entry.decision === "change_score" && entry.verdictChoice === answerRow.selectedChoice) {
        return status(400, {
          message: `answer ${answerId}: change_score must differ from the current choice`,
        });
      }

      // approve → recommended for EVERY level (only finalize writes `finished`).
      const outcomeStatus =
        entry.decision === "approve" ? ("recommended" as const) : ("rejected" as const);

      await database.insert(answerLogs).values({
        answerId,
        status: outcomeStatus,
        verdictChoice: entry.decision === "change_score" ? entry.verdictChoice : null,
        description: entry.decision !== "approve" ? entry.description : null,
        eval_id: accountId,
      });

      return status(200, { message: "verdict saved", answerId, status: outcomeStatus });
    },

    verdict: async (coverId: number, reviewer: ReviewerContext, batch: VerdictBatch) => {
      const { accountId, level, region } = reviewer;

      const coverCheck = await helper.assertCoverAccess(coverId, region);
      if (coverCheck instanceof ElysiaCustomStatusResponse) return coverCheck;

      const answerIds = batch.map((e) => e.answerId);
      if (new Set(answerIds).size !== answerIds.length) {
        return status(400, { message: "duplicate answerId in batch" });
      }

      const answerRows = await database
        .select({
          answerId: answers.id,
          category: questions.category,
          selectedChoice: answers.selectedChoice,
        })
        .from(answers)
        .innerJoin(questions, eq(questions.id, answers.questionId))
        .where(and(eq(answers.coverId, coverId), inArray(answers.id, answerIds)));

      if (answerRows.length !== answerIds.length) {
        return status(400, { message: "one or more answers not found in this cover" });
      }

      const categoryMap = new Map(answerRows.map((r) => [r.answerId, r.category as string]));
      const choiceMap = new Map(answerRows.map((r) => [r.answerId, r.selectedChoice]));
      const categories = categoriesFor(level);
      const outOfScope = answerIds.some((id) => !categories.includes(categoryMap.get(id) ?? ""));
      if (outOfScope) {
        return status(403, { message: "batch contains answers outside your category scope" });
      }

      const latestLogs = await database
        .selectDistinctOn([answerLogs.answerId], {
          answerId: answerLogs.answerId,
          status: answerLogs.status,
        })
        .from(answerLogs)
        .where(inArray(answerLogs.answerId, answerIds))
        .orderBy(answerLogs.answerId, desc(answerLogs.id));

      const statusMap = new Map(latestLogs.map((l) => [l.answerId, l.status]));

      for (const entry of batch) {
        const currentStatus = statusMap.get(entry.answerId) ?? "in_review";
        if (currentStatus === "finished") {
          return status(400, { message: `answer ${entry.answerId} is already finalized` });
        }
        if (currentStatus === "recommended" && level !== "ODPC") {
          return status(403, {
            message: `answer ${entry.answerId} is recommended; only ODPC can override`,
          });
        }
        // A change_score to the factory's current choice is a no-op that would still
        // bounce the cover back to in_progress — reject it; use "approve" instead.
        if (
          entry.decision === "change_score" &&
          entry.verdictChoice === choiceMap.get(entry.answerId)
        ) {
          return status(400, {
            message: `answer ${entry.answerId}: change_score must differ from the current choice`,
          });
        }
      }

      const logRows = batch.map((entry) => {
        const outcomeStatus =
          entry.decision === "approve"
            ? level === "ODPC"
              ? ("finished" as const)
              : ("recommended" as const)
            : ("rejected" as const);

        return {
          answerId: entry.answerId,
          status: outcomeStatus,
          verdictChoice: entry.decision === "change_score" ? entry.verdictChoice : null,
          description: entry.decision !== "approve" ? entry.description : null,
          eval_id: accountId,
        };
      });

      // ODPC finalize path: backstop + finalize gate + file deletion + cover transition
      if (level === "ODPC") {
        // Fetch factory contact for verdict email (before txn so it's always available)
        const enrollData = await database
          .select({
            email: enrolls.safetyOfficerEmail,
            factoryNameTh: factories.nameTh,
          })
          .from(covers)
          .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
          .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
          .where(eq(covers.id, coverId))
          .limit(1)
          .then((r) => r[0]);

        const allCoverAnswers = await database
          .select({
            answerId: answers.id,
            selectedChoice: answers.selectedChoice,
            category: questions.category,
            special: questions.special,
            fileUrl1_1: answers.fileUrl1_1,
            fileUrl1_2: answers.fileUrl1_2,
            fileUrl1_3: answers.fileUrl1_3,
            fileUrl2_1: answers.fileUrl2_1,
            fileUrl2_2: answers.fileUrl2_2,
            fileUrl2_3: answers.fileUrl2_3,
            fileUrl3_1: answers.fileUrl3_1,
            fileUrl3_2: answers.fileUrl3_2,
            fileUrl3_3: answers.fileUrl3_3,
          })
          .from(answers)
          .innerJoin(questions, eq(questions.id, answers.questionId))
          .where(eq(answers.coverId, coverId));

        const allCoverAnswerIds = allCoverAnswers.map((a) => a.answerId);

        const allLatestLogs = await database
          .selectDistinctOn([answerLogs.answerId], {
            answerId: answerLogs.answerId,
            status: answerLogs.status,
            verdictChoice: answerLogs.verdictChoice,
          })
          .from(answerLogs)
          .where(inArray(answerLogs.answerId, allCoverAnswerIds))
          .orderBy(answerLogs.answerId, desc(answerLogs.id));

        const allLogMap = new Map(allLatestLogs.map((l) => [l.answerId, l]));
        const batchIds = new Set(logRows.map((r) => r.answerId));
        const batchDecisionMap = new Map(logRows.map((r) => [r.answerId, r]));

        const effectiveState = allCoverAnswers.map((a) => {
          if (batchIds.has(a.answerId)) {
            // biome-ignore lint/style/noNonNullAssertion: batchIds guarantees presence
            const row = batchDecisionMap.get(a.answerId)!;
            return {
              answerId: a.answerId,
              finalStatus: row.status as string,
              finalVerdictChoice: row.verdictChoice,
            };
          }
          const log = allLogMap.get(a.answerId);
          const currentStatus = log?.status ?? "in_review";
          // Backstop: un-overridden recommended answers auto-convert to finished
          if (currentStatus === "recommended") {
            return { answerId: a.answerId, finalStatus: "finished", finalVerdictChoice: null };
          }
          return {
            answerId: a.answerId,
            finalStatus: currentStatus as string,
            finalVerdictChoice: log?.verdictChoice ?? null,
          };
        });

        const hasUnresolved = effectiveState.some((s) => s.finalStatus === "in_review");
        if (hasUnresolved) {
          return status(400, {
            message: "finalization blocked: unresolved in_review answers remain",
          });
        }

        const backstopRows = allCoverAnswers
          .filter(
            (a) =>
              !batchIds.has(a.answerId) &&
              (allLogMap.get(a.answerId)?.status ?? "in_review") === "recommended",
          )
          .map((a) => ({
            answerId: a.answerId,
            status: "finished" as const,
            verdictChoice: null,
            description: null,
            eval_id: accountId,
          }));

        const hardRejectIds = new Set(
          effectiveState
            .filter((s) => s.finalStatus === "rejected" && s.finalVerdictChoice === null)
            .map((s) => s.answerId),
        );

        const fileUrlsToDelete: string[] = [];
        for (const a of allCoverAnswers) {
          if (!hardRejectIds.has(a.answerId)) continue;
          for (const url of [
            a.fileUrl1_1,
            a.fileUrl1_2,
            a.fileUrl1_3,
            a.fileUrl2_1,
            a.fileUrl2_2,
            a.fileUrl2_3,
            a.fileUrl3_1,
            a.fileUrl3_2,
            a.fileUrl3_3,
          ]) {
            if (url) fileUrlsToDelete.push(url);
          }
        }

        // File I/O outside the transaction — project pattern
        await Promise.all(fileUrlsToDelete.map((url) => utilities().deleteFile(url)));

        const hasRejected = effectiveState.some((s) => s.finalStatus === "rejected");
        const newCoverStatus = hasRejected ? ("in_progress" as const) : ("finished" as const);

        await database.transaction(async (tx) => {
          for (const row of logRows) {
            await tx.insert(answerLogs).values(row);
          }
          for (const row of backstopRows) {
            await tx.insert(answerLogs).values(row);
          }
          if (hardRejectIds.size > 0) {
            await tx
              .update(answers)
              .set({
                fileUrl1_1: null,
                fileUrl1_2: null,
                fileUrl1_3: null,
                fileUrl2_1: null,
                fileUrl2_2: null,
                fileUrl2_3: null,
                fileUrl3_1: null,
                fileUrl3_2: null,
                fileUrl3_3: null,
              })
              .where(inArray(answers.id, [...hardRejectIds]));
          }
          await tx
            .insert(coverLogs)
            .values({ coverId, status: newCoverStatus, evaluatorId: accountId });
        });

        // Compute grade (on-demand, not persisted)
        const gradeAnswers = allCoverAnswers.map((a) => ({
          selectedChoice: a.selectedChoice,
          category: a.category as CategoryKey,
          special: a.special,
        }));
        const scoring = calculateBreakdown(gradeAnswers);
        const grade = newCoverStatus === "finished" ? computeGrade(scoring, gradeAnswers) : null;

        // Enqueue verdict email after committed txn; swallow queue failures
        if (enrollData?.email) {
          try {
            if (newCoverStatus === "finished") {
              await emailQueue.add("verdict-result-finished", {
                email: enrollData.email,
                grade,
                factoryNameTh: enrollData.factoryNameTh,
              });
            } else {
              await emailQueue.add("verdict-result-in-progress", {
                email: enrollData.email,
                factoryNameTh: enrollData.factoryNameTh,
              });
            }
          } catch (err) {
            console.error("Failed to enqueue verdict email", err);
          }
        }

        return status(200, { message: "verdict submitted", grade });
      }

      // Tier-1: write answer logs only (no cover transition)
      await database.transaction(async (tx) => {
        for (const row of logRows) {
          await tx.insert(answerLogs).values(row);
        }
      });

      return status(200, { message: "verdict submitted" });
    },
  };
};

export const evaluatorReviewService = createEvaluatorReviewService(db);
