import { and, desc, eq, inArray } from "drizzle-orm";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { db } from "../drizzle";
import {
  accounts,
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
import type { StandardFileItem, VerdictSaveBody } from "../schema/evaluator-review";
import { utilities } from "../utils";
import { latestCoverLogFor } from "./coverStatus";
import { categoriesFor, type EvaluatorLevel, evaluatorService } from "./evaluator";
import { provincialOfficerService } from "./provincialOfficer";
import { type CategoryKey, calculateBreakdown, computeGrade } from "./scoreHelpers";

type QuestionCategory = (typeof questionCategories.enumValues)[number];

/**
 * Authoritative pairing of each `standardTypes` key to its enroll (bool, url) columns.
 * Single source of truth for the standards projection (intent 009). The enum key ≠ column
 * name (`standardHC` → `standardHc`/`fileStandardHcUrl`), so the pairing is explicit.
 */
const STANDARD_ENROLL_COLUMNS = [
  { standard: "standardHC", bool: "standardHc", url: "fileStandardHcUrl" },
  { standard: "standardSAN", bool: "standardSan", url: "fileStandardSanUrl" },
  { standard: "standardSANPlus", bool: "standardSanPlus", url: "fileStandardSanPlusUrl" },
  { standard: "standardWellness", bool: "standardWellness", url: "fileStandardWellnessUrl" },
  { standard: "standardSafety", bool: "standardSafety", url: "fileStandardSafetyUrl" },
  { standard: "standardTIS18001", bool: "standardTis18001", url: "fileStandardTis18001Url" },
  { standard: "standardISO45001", bool: "standardIso45001", url: "fileStandardIso45001Url" },
  { standard: "standardISO14001", bool: "standardIso14001", url: "fileStandardIso14001Url" },
  { standard: "standardZero", bool: "standardZero", url: "fileStandardZeroUrl" },
  { standard: "standard5S", bool: "standard5S", url: "fileStandard5SUrl" },
  { standard: "standardHAS", bool: "standardHas", url: "fileStandardHasUrl" },
] as const;

/** Claimed + uploaded standard certificates for an enroll row → view items (intent 009). */
const standardFilesFromEnroll = (
  row: Record<string, boolean | string | null>,
): StandardFileItem[] =>
  STANDARD_ENROLL_COLUMNS.flatMap(({ standard, bool, url }) => {
    const fileName = row[url];
    return row[bool] === true && typeof fileName === "string" && fileName.length > 0
      ? [{ standard, fileName }]
      : [];
  });

/**
 * The scope a reviewer is authorized against: national (no gate, existence only),
 * region (health-region gate), or province (single-province gate). A discriminated
 * union so a context always carries exactly one scope — there is no "no scope" state.
 */
export type ReviewerScope =
  | { kind: "national" }
  | { kind: "region"; region: number }
  | { kind: "province"; province: number };

/** The resolved actor performing a review, decoupled from how it authenticated. */
export type ReviewerContext = {
  accountId: number;
  level: EvaluatorLevel;
  scope: ReviewerScope;
};

/** A DOED admin always reviews as a national ODPC. */
export const adminReviewerContext = (accountId: number): ReviewerContext => ({
  accountId,
  level: "ODPC",
  scope: { kind: "national" },
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

  const assertCoverInProvince = async (coverId: number, province: number) => {
    const row = await database
      .select({ coverId: covers.id })
      .from(covers)
      .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
      .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
      .where(and(eq(covers.id, coverId), eq(factories.provinceId, province)))
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

  /** Scope-aware cover access: dispatches on the reviewer scope discriminator. */
  const assertCoverAccess = async (coverId: number, scope: ReviewerScope) => {
    switch (scope.kind) {
      case "national":
        return assertCoverExists(coverId);
      case "region":
        return assertCoverInRegion(coverId, scope.region);
      case "province":
        return assertCoverInProvince(coverId, scope.province);
    }
  };

  return { assertCoverInRegion, assertCoverInProvince, assertCoverExists, assertCoverAccess };
};

export const createEvaluatorReviewService = (database: typeof db) => {
  const helper = createEvaluatorReviewHelper(database);

  /**
   * Resolve an evaluator caller into a ReviewerContext (level + region scope).
   * Returns the 404 status response from getEvaluatorData if the caller is not an evaluator.
   */
  const resolveEvaluator = async (callerId: number) => {
    const evaluatorData = await evaluatorService.helper.getEvaluatorData(callerId);
    if (evaluatorData instanceof ElysiaCustomStatusResponse) return evaluatorData;
    // biome-ignore lint/style/noNonNullAssertion: guaranteed non-null after getEvaluatorData
    const evaluator = evaluatorData.evaluator!;
    return {
      accountId: evaluator.accountId,
      level: evaluator.level,
      scope: { kind: "region" as const, region: evaluator.region },
    };
  };

  /**
   * Resolve a Provincial Officer caller into a province-scoped ReviewerContext at level
   * `ODPC`, so category filtering includes all five QuestionCategories (decision #1).
   * Returns the existing `404 { message: "officer not found" }` for a non-officer caller.
   */
  const resolveProvincialOfficer = async (callerId: number) => {
    const officerData = await provincialOfficerService.getOfficerDataById(callerId);
    if (officerData instanceof ElysiaCustomStatusResponse) return officerData;
    return {
      accountId: callerId,
      level: "ODPC" as const,
      scope: { kind: "province" as const, province: officerData.provinceId },
    };
  };

  return {
    resolveEvaluator,
    resolveProvincialOfficer,

    getAnswers: async (coverId: number, reviewer: ReviewerContext) => {
      const coverCheck = await helper.assertCoverAccess(coverId, reviewer.scope);
      if (coverCheck instanceof ElysiaCustomStatusResponse) return coverCheck;

      // Province-scoped reader (Provincial Officer, issue 02): the same 404 that gates an
      // out-of-province Cover also gates an in_progress one, so this read never confirms a
      // Cover's existence before the Evaluator has opened it. No other scope is gated here —
      // an Evaluator keeps reading an in_progress Cover unchanged.
      let redactVerdicts = false;
      if (reviewer.scope.kind === "province") {
        const latestStatus = (await latestCoverLogFor(database, coverId)) ?? "in_progress";
        if (latestStatus === "in_progress") return status(404, { message: "cover not found" });
        // While in_review, every Verdict Score is withheld from the Officer; once finished,
        // the Officer sees exactly what an Evaluator sees (decisions #2, #5).
        redactVerdicts = latestStatus === "in_review";
      }

      // Factory's claimed + uploaded standard certificates for this cover (intent 009).
      // Factory-level (not category-scoped) — every reviewer with cover access sees all.
      const enrollRow = await database
        .select({
          standardHc: enrolls.standardHc,
          fileStandardHcUrl: enrolls.fileStandardHcUrl,
          standardSan: enrolls.standardSan,
          fileStandardSanUrl: enrolls.fileStandardSanUrl,
          standardSanPlus: enrolls.standardSanPlus,
          fileStandardSanPlusUrl: enrolls.fileStandardSanPlusUrl,
          standardWellness: enrolls.standardWellness,
          fileStandardWellnessUrl: enrolls.fileStandardWellnessUrl,
          standardSafety: enrolls.standardSafety,
          fileStandardSafetyUrl: enrolls.fileStandardSafetyUrl,
          standardTis18001: enrolls.standardTis18001,
          fileStandardTis18001Url: enrolls.fileStandardTis18001Url,
          standardIso45001: enrolls.standardIso45001,
          fileStandardIso45001Url: enrolls.fileStandardIso45001Url,
          standardIso14001: enrolls.standardIso14001,
          fileStandardIso14001Url: enrolls.fileStandardIso14001Url,
          standardZero: enrolls.standardZero,
          fileStandardZeroUrl: enrolls.fileStandardZeroUrl,
          standard5S: enrolls.standard5S,
          fileStandard5SUrl: enrolls.fileStandard5SUrl,
          standardHas: enrolls.standardHas,
          fileStandardHasUrl: enrolls.fileStandardHasUrl,
        })
        .from(enrolls)
        .innerJoin(covers, eq(covers.enrollId, enrolls.id))
        .where(eq(covers.id, coverId))
        .limit(1)
        .then((r) => r[0]);

      const standards = enrollRow ? standardFilesFromEnroll(enrollRow) : [];

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

      const answerIds = filteredAnswers.map((a) => a.answerId);

      // Guard the empty inArray; standards are returned regardless of the answers count.
      const latestLogs = answerIds.length
        ? await database
            .selectDistinctOn([answerLogs.answerId], {
              answerId: answerLogs.answerId,
              status: answerLogs.status,
              verdictChoice: answerLogs.verdictChoice,
              description: answerLogs.description,
            })
            .from(answerLogs)
            .where(inArray(answerLogs.answerId, answerIds))
            .orderBy(answerLogs.answerId, desc(answerLogs.id))
        : [];

      const logMap = new Map(latestLogs.map((l) => [l.answerId, l]));

      const answerItems = filteredAnswers.map((a) => {
        const log = logMap.get(a.answerId);
        return {
          answerId: a.answerId,
          questionId: a.questionId,
          category: a.category as string,
          status: redactVerdicts ? "in_review" : (log?.status ?? "in_review"),
          selectedChoice: a.selectedChoice,
          latestVerdictChoice: redactVerdicts ? null : (log?.verdictChoice ?? null),
          latestDescription: redactVerdicts ? null : (log?.description ?? null),
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

      return status(200, { answers: answerItems, standards });
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
      const { accountId, level, scope } = reviewer;

      const coverCheck = await helper.assertCoverAccess(coverId, scope);
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

    /**
     * ODPC/admin whole-Cover finalize (ADR-0005). Reads the *persisted* latest answerLogs
     * (no in-flight batch / effectiveState merge — that is the split from `verdict()`),
     * hard-gates on any `in_review`, converts un-overridden `recommended` → `finished`,
     * deletes hard-reject files (outside + before the txn), writes the single `coverLogs`
     * transition, computes the Grade on-demand, and emails the factory. This is the ONLY
     * writer of `finished` and of a `coverLogs` transition.
     */
    finalize: async (coverId: number, reviewer: ReviewerContext) => {
      const { accountId, level, scope } = reviewer;

      // ODPC-only gate (native ODPC or DOED-admin-as-national). No DB read before the gate.
      if (level !== "ODPC") {
        return status(403, { message: "finalize is restricted to ODPC" });
      }

      const coverCheck = await helper.assertCoverAccess(coverId, scope);
      if (coverCheck instanceof ElysiaCustomStatusResponse) return coverCheck;

      // Factory contact for the verdict email (before txn so it's always available).
      // Primary recipient is the factory's login address (`Accounts.email`, NOT NULL + unique)
      // so delivery is guaranteed; `Enrolls.safety_officer_email` is nullable/optional on the
      // enroll DTO and silently skipped the email when blank, so it rides along as a cc.
      const enrollData = await database
        .select({
          email: accounts.email,
          ccEmail: enrolls.safetyOfficerEmail,
          factoryNameTh: factories.nameTh,
        })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
        .innerJoin(accounts, eq(accounts.id, factories.accountId))
        .where(eq(covers.id, coverId))
        .limit(1)
        .then((r) => r[0]);

      // Every answer in the cover + grading inputs + files
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

      // The persisted latest log per answer is the SOLE input — no batch merge.
      const latestLogs = await database
        .selectDistinctOn([answerLogs.answerId], {
          answerId: answerLogs.answerId,
          status: answerLogs.status,
          verdictChoice: answerLogs.verdictChoice,
        })
        .from(answerLogs)
        .where(inArray(answerLogs.answerId, allCoverAnswerIds))
        .orderBy(answerLogs.answerId, desc(answerLogs.id));

      const logMap = new Map(latestLogs.map((l) => [l.answerId, l]));

      // Resolve each answer's final status from persisted logs (no log yet ⇒ in_review).
      const resolved = allCoverAnswers.map((a) => {
        const log = logMap.get(a.answerId);
        return {
          answerId: a.answerId,
          status: log?.status ?? "in_review",
          verdictChoice: log?.verdictChoice ?? null,
        };
      });

      // Hard-gate: finalize invents no verdict — any leftover in_review blocks it.
      if (resolved.some((r) => r.status === "in_review")) {
        return status(400, {
          message: "finalization blocked: unresolved in_review answers remain",
        });
      }

      // Promotions: un-overridden recommended → finished (the ONLY write of `finished`).
      const promotionRows = resolved
        .filter((r) => r.status === "recommended")
        .map((r) => ({
          answerId: r.answerId,
          status: "finished" as const,
          verdictChoice: null,
          description: null,
          eval_id: accountId,
        }));

      // Rejected-at-finalize set: any Answer whose final status is `rejected` — hard reject
      // or change_score alike — has its files deleted + nulled (ADR-0006). An Answer
      // re-saved to approve/recommended before finalize is excluded, since `resolved`
      // reflects only the latest persisted answerLogs row per Answer.
      const rejectedAnswerIds = new Set(
        resolved.filter((r) => r.status === "rejected").map((r) => r.answerId),
      );

      const fileUrlsToDelete: string[] = [];
      for (const a of allCoverAnswers) {
        if (!rejectedAnswerIds.has(a.answerId)) continue;
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

      // File I/O outside (and before) the transaction — project pattern. Uses the STRICT
      // delete so a MinIO failure surfaces here and aborts finalize *before* any DB write
      // → no partial cover transition (story 004 edge case). The 500 is logged by the
      // global onAfterResponse handler.
      try {
        await Promise.all(fileUrlsToDelete.map((url) => utilities().deleteFileStrict(url)));
      } catch {
        return status(500, {
          message: "failed to delete rejected answer files; finalize aborted",
        });
      }

      const hasRejected = resolved.some((r) => r.status === "rejected");
      const newCoverStatus = hasRejected ? ("in_progress" as const) : ("finished" as const);

      await database.transaction(async (tx) => {
        for (const row of promotionRows) {
          await tx.insert(answerLogs).values(row);
        }
        if (rejectedAnswerIds.size > 0) {
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
            .where(inArray(answers.id, [...rejectedAnswerIds]));
        }
        await tx
          .insert(coverLogs)
          .values({ coverId, status: newCoverStatus, evaluatorId: accountId });
      });

      // Grade (on-demand, not persisted — ADR-0001). Computed from the factory's choices;
      // on the finished outcome no answer is rejected, so selectedChoice is the settled value.
      const gradeAnswers = allCoverAnswers.map((a) => ({
        selectedChoice: a.selectedChoice,
        category: a.category as CategoryKey,
        special: a.special,
      }));
      const scoring = calculateBreakdown(gradeAnswers);
      const grade = newCoverStatus === "finished" ? computeGrade(scoring, gradeAnswers) : null;

      // Enqueue exactly one factory email after the committed txn; swallow queue failures.
      if (enrollData?.email) {
        // cc the safety officer when they have an address of their own — omitted when blank
        // or identical to the account address, so nobody is addressed twice.
        const cc =
          enrollData.ccEmail && enrollData.ccEmail !== enrollData.email
            ? enrollData.ccEmail
            : undefined;
        try {
          if (newCoverStatus === "finished") {
            await emailQueue.add("verdict-result-finished", {
              email: enrollData.email,
              cc,
              grade,
              factoryNameTh: enrollData.factoryNameTh,
            });
          } else {
            await emailQueue.add("verdict-result-in-progress", {
              email: enrollData.email,
              cc,
              factoryNameTh: enrollData.factoryNameTh,
            });
          }
        } catch (err) {
          console.error("Failed to enqueue verdict email", err);
        }
      }

      return status(200, { message: "cover finalized", coverStatus: newCoverStatus, grade });
    },
  };
};

export const evaluatorReviewService = createEvaluatorReviewService(db);
