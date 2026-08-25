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
import { categoriesFor, type EvaluatorLevel, evaluatorService } from "./evaluator";
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

      // approve → recommended, and change_score with it: a settled score correction is
      // terminal and never returns to the factory (ADR supersedes 0004's consensus loop for
      // score changes). Only a hard `reject` writes `rejected`; only finalize writes `finished`.
      //
      // No file check runs here, in EITHER direction. The evaluator is the authority on what the
      // evidence supports; refusing an upgrade would leave them only the hard reject, which
      // deletes the factory's evidence and forces a redo — a worse outcome than honouring the
      // verdict. Decided 2026-08-24, superseding the save-time evidence guard.
      const outcomeStatus =
        entry.decision === "reject" ? ("rejected" as const) : ("recommended" as const);

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
      const { accountId, level, region } = reviewer;

      // ODPC-only gate (native ODPC or DOED-admin-as-national). No DB read before the gate.
      if (level !== "ODPC") {
        return status(403, { message: "finalize is restricted to ODPC" });
      }

      const coverCheck = await helper.assertCoverAccess(coverId, region);
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
          enrollId: enrolls.id,
          // The eleven (claimed, certificate) pairs. Enumerated rather than spread from
          // STANDARD_ENROLL_COLUMNS because a computed select object loses Drizzle's column
          // inference; the map below still drives every *read* of these fields.
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
          standard: questions.standard,
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
          description: answerLogs.description,
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
          // Carried into the promotion row so the evaluator's reason survives finalize — it is
          // the factory's only explanation now that a score change is never negotiated.
          description: log?.description ?? null,
        };
      });

      // Hard-gate: finalize invents no verdict — any leftover in_review blocks it.
      if (resolved.some((r) => r.status === "in_review")) {
        return status(400, {
          message: "finalization blocked: unresolved in_review answers remain",
        });
      }

      // Classification. A settled score change is identified by its `verdictChoice`, NOT by its
      // status, because it arrives in two shapes: `recommended` (saved after this intent) and
      // `rejected` (rows written under the old semantics, still in production). Keying on the
      // discriminator both shapes share is what lets legacy rows finalize correctly with no
      // backfill. `verdictChoice` is only ever written by `change_score`, so a non-null value
      // cannot mean anything else.
      // `finished` Answers are excluded throughout: a Cover that bounced to `in_progress` and
      // is finalized again still carries the rows promoted by the FIRST finalize, and they are
      // immutable. Re-promoting them would append duplicate `finished` logs on every pass.
      const open = resolved.filter((r) => r.status !== "finished");

      const settledScores = open.filter((r) => r.verdictChoice !== null);
      const settledChoiceById = new Map(
        settledScores.map((r) => [r.answerId, r.verdictChoice as string]),
      );

      // A hard reject is `rejected` with NO verdict choice — the evaluator proposed no
      // replacement. Only these lose their evidence and send the Cover back.
      const hardRejectIds = new Set(
        open
          .filter((r) => r.status === "rejected" && r.verdictChoice === null)
          .map((r) => r.answerId),
      );

      // Standard certificates behind a hard-rejected question. A standard-backed Answer holds
      // no per-answer files — `selectedChoice` was forced to "3" from the certificate — so
      // without this a hard reject deletes nothing and the redo re-derives the same "3".
      // Every standard the rejected question NAMES and the factory actually CLAIMS is deleted,
      // even when other questions still rely on it (decision 1, 2026-08-24).
      const doomedStandards = new Set<string>();
      for (const a of allCoverAnswers) {
        if (!hardRejectIds.has(a.answerId)) continue;
        for (const std of a.standard) {
          const cols = STANDARD_ENROLL_COLUMNS.find((c) => c.standard === std);
          if (!cols) continue;
          const claimed = enrollData?.[cols.bool] === true;
          const certificate = enrollData?.[cols.url];
          if (claimed && typeof certificate === "string" && certificate.length > 0) {
            doomedStandards.add(std);
          }
        }
      }

      // Collateral: an Answer scored from a certificate this finalize deletes has lost its
      // basis, so it returns to `in_review` for the factory to re-answer with real evidence.
      // Already-`finished` Answers are exempt — reopening one would break "finished is
      // immutable to everyone" (decision 6, 2026-08-25); that is a separate intent.
      const collateralIds = new Set(
        doomedStandards.size === 0
          ? []
          : allCoverAnswers
              .filter(
                (a) =>
                  !hardRejectIds.has(a.answerId) &&
                  a.standard.some((std) => doomedStandards.has(std)),
              )
              .map((a) => a.answerId)
              .filter((id) => open.some((r) => r.answerId === id)),
      );

      // Promotions: every non-hard-reject Answer → finished (the ONLY write of `finished`).
      // A settled score change carries its `verdictChoice` forward rather than nulling it, so
      // the latest log still records what was corrected — the factory-facing read keys off
      // exactly this row.
      const promotionRows = open
        .filter((r) => !hardRejectIds.has(r.answerId) && !collateralIds.has(r.answerId))
        .map((r) => ({
          answerId: r.answerId,
          status: "finished" as const,
          verdictChoice: r.verdictChoice,
          description: r.description,
          eval_id: accountId,
        }));

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

      for (const std of doomedStandards) {
        const cols = STANDARD_ENROLL_COLUMNS.find((c) => c.standard === std);
        const certificate = cols ? enrollData?.[cols.url] : null;
        if (typeof certificate === "string" && certificate.length > 0) {
          fileUrlsToDelete.push(certificate);
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

      // Only a hard reject owes the factory anything — a settled score change is closed.
      const hasHardReject = hardRejectIds.size > 0;
      const newCoverStatus = hasHardReject ? ("in_progress" as const) : ("finished" as const);

      await database.transaction(async (tx) => {
        for (const row of promotionRows) {
          await tx.insert(answerLogs).values(row);
        }
        // The Verdict Score becomes the settled choice. This is the write `accept` used to
        // perform (answer.ts) before the negotiation loop was retired for score changes.
        for (const [answerIdToSettle, choice] of settledChoiceById) {
          await tx
            .update(answers)
            .set({ selectedChoice: choice as (typeof answers.selectedChoice.enumValues)[number] })
            .where(eq(answers.id, answerIdToSettle));
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
        // Un-claim each deleted standard: the certificate is gone, so the claim cannot stand.
        // This preserves the invariant `enroll.create` enforces — a claimed standard must have
        // a file — and lets the redo fall through to a normal file-based answer instead of
        // erroring with "standard file not found in enroll" (decision 2, 2026-08-24).
        if (doomedStandards.size > 0 && enrollData?.enrollId) {
          const unclaim: Record<string, null | false> = {};
          for (const std of doomedStandards) {
            const cols = STANDARD_ENROLL_COLUMNS.find((c) => c.standard === std);
            if (!cols) continue;
            unclaim[cols.url] = null;
            unclaim[cols.bool] = false;
          }
          await tx.update(enrolls).set(unclaim).where(eq(enrolls.id, enrollData.enrollId));
        }

        // Collateral returns to `in_review` INSTEAD of being promoted — it was subtracted from
        // promotionRows above, so no Answer receives both rows in one transaction.
        for (const answerIdToReset of collateralIds) {
          await tx.insert(answerLogs).values({
            answerId: answerIdToReset,
            status: "in_review" as const,
            verdictChoice: null,
            description: null,
            eval_id: accountId,
          });
        }

        await tx
          .insert(coverLogs)
          .values({ coverId, status: newCoverStatus, evaluatorId: accountId });
      });

      // Grade (on-demand, not persisted — ADR-0001). `allCoverAnswers` was read before the
      // transaction, so it still holds pre-correction choices; overlay the settled Verdict
      // Scores here. The overlay and the DB write above derive from the same map, so they
      // cannot disagree.
      const gradeAnswers = allCoverAnswers.map((a) => ({
        selectedChoice: settledChoiceById.get(a.answerId) ?? a.selectedChoice,
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
