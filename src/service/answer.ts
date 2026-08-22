import { and, count, desc, eq, getTableColumns, gte, inArray, lt } from "drizzle-orm";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { db } from "../drizzle";
import { answerLogs, answers, coverLogs, covers, enrolls, questions } from "../drizzle/schema";
import type {
  CreateAnswerWithFilesDto,
  NegotiateAnswerDto,
  UpdateAnswerWithFilesDto,
} from "../schema/answer";
import { utilities } from "../utils";

/**
 * Resolves which fiscal year a Factory write targets, or refuses.
 *
 * Grace WIDENS the selection window rather than gating an existing target: these paths take no
 * coverId, they FIND the Cover using the year window. The year must therefore be resolved before the
 * lookup, not after it — the reverse of `assertYearWritable` on the evaluator paths, where the
 * target already exists.
 *
 * An explicit year is safe here because `factoryId` comes from the JWT subject, so the query is
 * already confined to the caller's own records. Naming a year selects among its OWN Covers.
 * Widening the window while keeping `.limit(1)` would instead pick arbitrarily between two
 * legitimately open years during grace.
 */
const resolveWritableYear = (fiscalYear?: number) => {
  const currentYear = utilities().getFiscalYearOf(new Date());
  const targetYear = fiscalYear ?? currentYear;

  if (targetYear !== currentYear && !utilities().factoryGraceApplies(targetYear)) {
    return status(403, { message: `fiscal year ${targetYear} is closed to factories` });
  }

  return targetYear;
};

export const createAnswerService = (database: typeof db) => {
  return {
    saveAnswer: async (factoryId: number, dto: CreateAnswerWithFilesDto, fiscalYear?: number) => {
      const targetYear = resolveWritableYear(fiscalYear);
      if (targetYear instanceof ElysiaCustomStatusResponse) return targetYear;

      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(targetYear);

      const cover = await database
        .select({ coverId: covers.id, enrollId: covers.enrollId })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!cover) return status(404, { message: "cover not found" });

      const question = await database
        .select()
        .from(questions)
        .where(eq(questions.id, dto.questionId))
        .limit(1)
        .then((res) => res[0]);

      if (!question) return status(404, { message: "question not found" });

      const existingAnswer = await database
        .select({ id: answers.id })
        .from(answers)
        .where(and(eq(answers.coverId, cover.coverId), eq(answers.questionId, dto.questionId)))
        .limit(1)
        .then((res) => res[0]);

      if (existingAnswer) return status(400, { message: "existed answer" });

      const hasFiles =
        dto.file_1_1 ||
        dto.file_1_2 ||
        dto.file_1_3 ||
        dto.file_2_1 ||
        dto.file_2_2 ||
        dto.file_2_3 ||
        dto.file_3_1 ||
        dto.file_3_2 ||
        dto.file_3_3;

      // Standard question branch
      if (question.standard.length > 0) {
        const enroll = await database
          .select()
          .from(enrolls)
          .where(eq(enrolls.id, cover.enrollId))
          .limit(1)
          .then((res) => res[0]);

        const standardBoolMap: Record<string, boolean | null | undefined> = {
          standardHC: enroll.standardHc,
          standardSAN: enroll.standardSan,
          standardSANPlus: enroll.standardSanPlus,
          standardWellness: enroll.standardWellness,
          standardSafety: enroll.standardSafety,
          standardTIS18001: enroll.standardTis18001,
          standardISO45001: enroll.standardIso45001,
          standardISO14001: enroll.standardIso14001,
          standardZero: enroll.standardZero,
          standard5S: enroll.standard5S,
          standardHAS: enroll.standardHas,
        };

        const standardUrlMap: Record<string, string | null | undefined> = {
          standardHC: enroll.fileStandardHcUrl,
          standardSAN: enroll.fileStandardSanUrl,
          standardSANPlus: enroll.fileStandardSanPlusUrl,
          standardWellness: enroll.fileStandardWellnessUrl,
          standardSafety: enroll.fileStandardSafetyUrl,
          standardTIS18001: enroll.fileStandardTis18001Url,
          standardISO45001: enroll.fileStandardIso45001Url,
          standardISO14001: enroll.fileStandardIso14001Url,
          standardZero: enroll.fileStandardZeroUrl,
          standard5S: enroll.fileStandard5SUrl,
          standardHAS: enroll.fileStandardHasUrl,
        };

        const factoryHasMatchingStandard = question.standard.some((s) => !!standardBoolMap[s]);

        if (factoryHasMatchingStandard) {
          // Factory enrolled for this standard — files sourced from enroll, not from DTO
          if (hasFiles) return status(400, { message: "standard question does not accept files" });

          const hasMatchingFile = question.standard.some((s) => !!standardUrlMap[s]);
          if (!hasMatchingFile)
            return status(404, { message: "standard file not found in enroll" });

          // Force selectedChoice = "3" — factory holds the certified standard
          await database.transaction(async (tx) => {
            const [inserted] = await tx
              .insert(answers)
              .values({ questionId: dto.questionId, coverId: cover.coverId, selectedChoice: "3" })
              .returning({ id: answers.id });
            await tx.insert(answerLogs).values({ answerId: inserted.id, status: "in_review" });
          });

          return status(201, { message: "answer save!" });
        }

        // Factory has no relevant standard → fall through to non-standard path
      }

      // Non-standard: validate files based on selected choice
      const choice = dto.selectedChoice;

      // choice "0" and "n/a" require no files — skip upload and go straight to transaction
      if (choice === "0" || choice === "n/a") {
        await database.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(answers)
            .values({
              questionId: dto.questionId,
              coverId: cover.coverId,
              selectedChoice: dto.selectedChoice,
            })
            .returning({ id: answers.id });

          await tx.insert(answerLogs).values({ answerId: inserted.id, status: "in_review" });
        });

        return status(201, { message: "answer save!" });
      }

      if (question.special === 3) {
        if (choice === "1" && !dto.file_1_1)
          return status(400, { message: "choice 1 requires file_1_1" });
        if (choice === "2" && !dto.file_2_1)
          return status(400, { message: "choice 2 requires file_2_1" });
        if (choice === "3" && !dto.file_3_1)
          return status(400, { message: "choice 3 requires file_3_1" });
      } else {
        if (choice === "1" && !dto.file_1_1)
          return status(400, { message: "choice 1 requires at least file_1_1" });
        if (choice === "2" && (!dto.file_1_1 || !dto.file_2_1))
          return status(400, { message: "choice 2 requires at least file_1_1 and file_2_1" });
        if (choice === "3" && (!dto.file_1_1 || !dto.file_2_1 || !dto.file_3_1))
          return status(400, {
            message: "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
          });
      }

      // Upload files outside the transaction so DB connection is not held during I/O
      const uploadIfExists = (file: File | undefined) =>
        file ? utilities().uploadFile(file) : Promise.resolve(null);

      const [
        fileUrl1_1,
        fileUrl1_2,
        fileUrl1_3,
        fileUrl2_1,
        fileUrl2_2,
        fileUrl2_3,
        fileUrl3_1,
        fileUrl3_2,
        fileUrl3_3,
      ] = await Promise.all([
        uploadIfExists(dto.file_1_1),
        uploadIfExists(dto.file_1_2),
        uploadIfExists(dto.file_1_3),
        uploadIfExists(dto.file_2_1),
        uploadIfExists(dto.file_2_2),
        uploadIfExists(dto.file_2_3),
        uploadIfExists(dto.file_3_1),
        uploadIfExists(dto.file_3_2),
        uploadIfExists(dto.file_3_3),
      ]);

      // Insert answer + log atomically
      await database.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(answers)
          .values({
            questionId: dto.questionId,
            coverId: cover.coverId,
            selectedChoice: dto.selectedChoice,
            fileUrl1_1,
            fileUrl1_2,
            fileUrl1_3,
            fileUrl2_1,
            fileUrl2_2,
            fileUrl2_3,
            fileUrl3_1,
            fileUrl3_2,
            fileUrl3_3,
          })
          .returning({ id: answers.id });

        await tx.insert(answerLogs).values({ answerId: inserted.id, status: "in_review" });
      });

      return status(201, { message: "answer save!" });
    },

    submit: async (factoryId: number, fiscalYear?: number) => {
      const targetYear = resolveWritableYear(fiscalYear);
      if (targetYear instanceof ElysiaCustomStatusResponse) return targetYear;

      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(targetYear);

      const cover = await database
        .select({ coverId: covers.id, enrollId: covers.enrollId })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!cover) return status(404, { message: "cover not found" });

      const latestCoverLog = await database
        .select({ status: coverLogs.status })
        .from(coverLogs)
        .where(eq(coverLogs.coverId, cover.coverId))
        .orderBy(desc(coverLogs.id))
        .limit(1)
        .then((res) => res[0]);

      if (!latestCoverLog || latestCoverLog.status !== "in_progress") {
        return status(400, { message: "cover is not in progress" });
      }

      // Auto-fill unanswered standard questions for standards the factory is enrolled in
      const enroll = await database
        .select()
        .from(enrolls)
        .where(eq(enrolls.id, cover.enrollId))
        .limit(1)
        .then((res) => res[0]);

      const standardBoolMap: Record<string, boolean | null | undefined> = {
        standardHC: enroll.standardHc,
        standardSAN: enroll.standardSan,
        standardSANPlus: enroll.standardSanPlus,
        standardWellness: enroll.standardWellness,
        standardSafety: enroll.standardSafety,
        standardTIS18001: enroll.standardTis18001,
        standardISO45001: enroll.standardIso45001,
        standardISO14001: enroll.standardIso14001,
        standardZero: enroll.standardZero,
        standard5S: enroll.standard5S,
        standardHAS: enroll.standardHas,
      };

      const allStandardQuestions = await database
        .select({ id: questions.id, standard: questions.standard })
        .from(questions);

      const matchedQuestionIds = allStandardQuestions
        .filter((q) => q.standard.length > 0 && q.standard.some((s) => !!standardBoolMap[s]))
        .map((q) => q.id);

      if (matchedQuestionIds.length > 0) {
        const existingAnswers = await database
          .select({ questionId: answers.questionId })
          .from(answers)
          .where(
            and(
              eq(answers.coverId, cover.coverId),
              inArray(answers.questionId, matchedQuestionIds),
            ),
          );

        const answeredIds = new Set(existingAnswers.map((a) => a.questionId));
        const unansweredIds = matchedQuestionIds.filter((id) => !answeredIds.has(id));

        if (unansweredIds.length > 0) {
          await database.transaction(async (tx) => {
            for (const questionId of unansweredIds) {
              const [inserted] = await tx
                .insert(answers)
                .values({ questionId, coverId: cover.coverId, selectedChoice: "3" })
                .returning({ id: answers.id });
              await tx.insert(answerLogs).values({
                answerId: inserted.id,
                status: "in_review",
                description: "ผ่านตามมาตรฐานเทียบเคียง",
              });
            }
          });
        }
      }

      const [{ totalQuestions }, { totalAnswers }] = await Promise.all([
        database
          .select({ totalQuestions: count() })
          .from(questions)
          .then((res) => res[0]),
        database
          .select({ totalAnswers: count() })
          .from(answers)
          .where(eq(answers.coverId, cover.coverId))
          .then((res) => res[0]),
      ]);

      if (totalAnswers !== totalQuestions) {
        return status(400, { message: "not all questions have been answered" });
      }

      const latestAnswerLogs = await database
        .selectDistinctOn([answerLogs.answerId], {
          status: answerLogs.status,
          answerId: answerLogs.answerId,
        })
        .from(answerLogs)
        .innerJoin(answers, eq(answers.id, answerLogs.answerId))
        .where(eq(answers.coverId, cover.coverId))
        .orderBy(answerLogs.answerId, desc(answerLogs.id));

      // Gate: no answer may be rejected at submit/re-submit time.
      // On initial submit all answers are in_review (no evaluator has acted yet), so this passes.
      // On re-submit the factory must have accepted/redone every rejection before re-submitting.
      const rejectedLogs = latestAnswerLogs.filter((log) => log.status === "rejected");
      if (rejectedLogs.length > 0) {
        return status(400, {
          message: "submit blocked: some answers are still rejected",
          rejectedAnswerIds: rejectedLogs.map((l) => l.answerId),
        });
      }

      await database.insert(coverLogs).values({ coverId: cover.coverId, status: "in_review" });

      return status(200, { message: "answers submit" });
    },

    getAnswerByFactoryId: async (factoryId: number, fiscalYear?: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(fiscalYear);
      const result = await database
        .select({ ...getTableColumns(answers) })
        .from(answers)
        .leftJoin(covers, eq(covers.id, answers.coverId))
        .leftJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        );

      if (result.length === 0) {
        return status(404, { message: "answers not found" });
      }

      // Enrich each answer with its latest verdict so the factory can see which
      // questions the evaluator/ODPC acted on, the proposed score, and the reason.
      // status="rejected" => needs action (covers both reject and change_score);
      // verdictChoice null on a rejected answer => hard reject (redo), set => score change.
      const answerIds = result.map((a) => a.id);
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
      const logByAnswer = new Map(latestLogs.map((l) => [l.answerId, l]));

      return result.map((a) => {
        const log = logByAnswer.get(a.id);
        return {
          ...a,
          status: log?.status ?? "in_review",
          verdictChoice: log?.verdictChoice ?? null,
          description: log?.description ?? null,
        };
      });
    },

    update: async (factoryId: number, dto: UpdateAnswerWithFilesDto, fiscalYear?: number) => {
      const targetYear = resolveWritableYear(fiscalYear);
      if (targetYear instanceof ElysiaCustomStatusResponse) return targetYear;

      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(targetYear);

      // 1. Find current fiscal year's cover
      const cover = await database
        .select({ coverId: covers.id, enrollId: covers.enrollId })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!cover) return status(404, { message: "cover not found" });

      // 2. Find question
      const question = await database
        .select()
        .from(questions)
        .where(eq(questions.id, dto.questionId))
        .limit(1)
        .then((res) => res[0]);

      if (!question) return status(404, { message: "question not found" });

      // 3. Find existing answer by coverId + questionId
      const existingAnswer = await database
        .select()
        .from(answers)
        .where(and(eq(answers.coverId, cover.coverId), eq(answers.questionId, dto.questionId)))
        .limit(1)
        .then((res) => res[0]);

      if (!existingAnswer) return status(404, { message: "answer not found" });

      // 4. Latest answerLog must be "in_review" or "rejected".
      // "recommended" (tier-1 provisional approval) and "finished" (ODPC final) are both
      // intentionally blocked — factory cannot edit while an evaluator verdict is in flight.
      const latestLog = await database
        .select({ status: answerLogs.status })
        .from(answerLogs)
        .where(eq(answerLogs.answerId, existingAnswer.id))
        .orderBy(desc(answerLogs.id))
        .limit(1)
        .then((res) => res[0]);

      if (!latestLog || (latestLog.status !== "in_review" && latestLog.status !== "rejected")) {
        return status(400, { message: "answer cannot be updated in its current status" });
      }

      // 5. Standard question branch
      if (question.standard.length > 0) {
        const enroll = await database
          .select()
          .from(enrolls)
          .where(eq(enrolls.id, cover.enrollId))
          .limit(1)
          .then((res) => res[0]);

        const standardBoolMap: Record<string, boolean | null | undefined> = {
          standardHC: enroll.standardHc,
          standardSAN: enroll.standardSan,
          standardSANPlus: enroll.standardSanPlus,
          standardWellness: enroll.standardWellness,
          standardSafety: enroll.standardSafety,
          standardTIS18001: enroll.standardTis18001,
          standardISO45001: enroll.standardIso45001,
          standardISO14001: enroll.standardIso14001,
          standardZero: enroll.standardZero,
          standard5S: enroll.standard5S,
          standardHAS: enroll.standardHas,
        };

        const standardUrlMap: Record<string, string | null | undefined> = {
          standardHC: enroll.fileStandardHcUrl,
          standardSAN: enroll.fileStandardSanUrl,
          standardSANPlus: enroll.fileStandardSanPlusUrl,
          standardWellness: enroll.fileStandardWellnessUrl,
          standardSafety: enroll.fileStandardSafetyUrl,
          standardTIS18001: enroll.fileStandardTis18001Url,
          standardISO45001: enroll.fileStandardIso45001Url,
          standardISO14001: enroll.fileStandardIso14001Url,
          standardZero: enroll.fileStandardZeroUrl,
          standard5S: enroll.fileStandard5SUrl,
          standardHAS: enroll.fileStandardHasUrl,
        };

        const factoryHasMatchingStandard = question.standard.some((s) => !!standardBoolMap[s]);

        if (factoryHasMatchingStandard) {
          const hasFiles =
            dto.file_1_1 ||
            dto.file_1_2 ||
            dto.file_1_3 ||
            dto.file_2_1 ||
            dto.file_2_2 ||
            dto.file_2_3 ||
            dto.file_3_1 ||
            dto.file_3_2 ||
            dto.file_3_3;

          if (hasFiles) return status(400, { message: "standard question does not accept files" });

          const hasMatchingFile = question.standard.some((s) => !!standardUrlMap[s]);
          if (!hasMatchingFile)
            return status(404, { message: "standard file not found in enroll" });

          // Force selectedChoice = "3" — factory holds the certified standard
          await database.transaction(async (tx) => {
            await tx
              .update(answers)
              .set({ selectedChoice: "3" })
              .where(eq(answers.id, existingAnswer.id));
            await tx
              .insert(answerLogs)
              .values({ answerId: existingAnswer.id, status: "in_review" });
          });

          return { message: "answer update" };
        }

        // Factory has no relevant standard → fall through to non-standard path
      }

      // 6. Non-standard: determine effective choice
      const effectiveChoice = dto.selectedChoice ?? existingAnswer.selectedChoice;

      // 7. File validation — new DTO file OR existing DB URL both satisfy the requirement
      if (question.special === 3) {
        if (effectiveChoice === "1" && !dto.file_1_1 && !existingAnswer.fileUrl1_1)
          return status(400, { message: "choice 1 requires file_1_1" });
        if (effectiveChoice === "2" && !dto.file_2_1 && !existingAnswer.fileUrl2_1)
          return status(400, { message: "choice 2 requires file_2_1" });
        if (effectiveChoice === "3" && !dto.file_3_1 && !existingAnswer.fileUrl3_1)
          return status(400, { message: "choice 3 requires file_3_1" });
      } else {
        if (effectiveChoice === "1" && !dto.file_1_1 && !existingAnswer.fileUrl1_1)
          return status(400, { message: "choice 1 requires at least file_1_1" });
        if (
          effectiveChoice === "2" &&
          ((!dto.file_1_1 && !existingAnswer.fileUrl1_1) ||
            (!dto.file_2_1 && !existingAnswer.fileUrl2_1))
        )
          return status(400, { message: "choice 2 requires at least file_1_1 and file_2_1" });
        if (
          effectiveChoice === "3" &&
          ((!dto.file_1_1 && !existingAnswer.fileUrl1_1) ||
            (!dto.file_2_1 && !existingAnswer.fileUrl2_1) ||
            (!dto.file_3_1 && !existingAnswer.fileUrl3_1))
        )
          return status(400, {
            message: "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
          });
      }

      // 8. Process file updates: if new file → delete old + upload; else keep existing
      const processAnswerFile = async (
        newFile: File | undefined,
        oldUrl: string | null | undefined,
      ) => {
        if (newFile) {
          if (oldUrl) await utilities().deleteFile(oldUrl);
          return await utilities().uploadFile(newFile);
        }
        return oldUrl ?? null;
      };

      const clearFile = async (oldUrl: string | null | undefined) => {
        if (oldUrl) await utilities().deleteFile(oldUrl);
        return null;
      };

      let fileUrl1_1: string | null,
        fileUrl1_2: string | null,
        fileUrl1_3: string | null,
        fileUrl2_1: string | null,
        fileUrl2_2: string | null,
        fileUrl2_3: string | null,
        fileUrl3_1: string | null,
        fileUrl3_2: string | null,
        fileUrl3_3: string | null;

      if (question.special === 3) {
        const g1 = effectiveChoice === "1";
        const g2 = effectiveChoice === "2";
        const g3 = effectiveChoice === "3";

        [
          fileUrl1_1,
          fileUrl1_2,
          fileUrl1_3,
          fileUrl2_1,
          fileUrl2_2,
          fileUrl2_3,
          fileUrl3_1,
          fileUrl3_2,
          fileUrl3_3,
        ] = await Promise.all([
          g1
            ? processAnswerFile(dto.file_1_1, existingAnswer.fileUrl1_1)
            : clearFile(existingAnswer.fileUrl1_1),
          g1
            ? processAnswerFile(dto.file_1_2, existingAnswer.fileUrl1_2)
            : clearFile(existingAnswer.fileUrl1_2),
          g1
            ? processAnswerFile(dto.file_1_3, existingAnswer.fileUrl1_3)
            : clearFile(existingAnswer.fileUrl1_3),
          g2
            ? processAnswerFile(dto.file_2_1, existingAnswer.fileUrl2_1)
            : clearFile(existingAnswer.fileUrl2_1),
          g2
            ? processAnswerFile(dto.file_2_2, existingAnswer.fileUrl2_2)
            : clearFile(existingAnswer.fileUrl2_2),
          g2
            ? processAnswerFile(dto.file_2_3, existingAnswer.fileUrl2_3)
            : clearFile(existingAnswer.fileUrl2_3),
          g3
            ? processAnswerFile(dto.file_3_1, existingAnswer.fileUrl3_1)
            : clearFile(existingAnswer.fileUrl3_1),
          g3
            ? processAnswerFile(dto.file_3_2, existingAnswer.fileUrl3_2)
            : clearFile(existingAnswer.fileUrl3_2),
          g3
            ? processAnswerFile(dto.file_3_3, existingAnswer.fileUrl3_3)
            : clearFile(existingAnswer.fileUrl3_3),
        ]);
      } else {
        [
          fileUrl1_1,
          fileUrl1_2,
          fileUrl1_3,
          fileUrl2_1,
          fileUrl2_2,
          fileUrl2_3,
          fileUrl3_1,
          fileUrl3_2,
          fileUrl3_3,
        ] = await Promise.all([
          processAnswerFile(dto.file_1_1, existingAnswer.fileUrl1_1),
          processAnswerFile(dto.file_1_2, existingAnswer.fileUrl1_2),
          processAnswerFile(dto.file_1_3, existingAnswer.fileUrl1_3),
          processAnswerFile(dto.file_2_1, existingAnswer.fileUrl2_1),
          processAnswerFile(dto.file_2_2, existingAnswer.fileUrl2_2),
          processAnswerFile(dto.file_2_3, existingAnswer.fileUrl2_3),
          processAnswerFile(dto.file_3_1, existingAnswer.fileUrl3_1),
          processAnswerFile(dto.file_3_2, existingAnswer.fileUrl3_2),
          processAnswerFile(dto.file_3_3, existingAnswer.fileUrl3_3),
        ]);
      }

      // 9. Update answer + log atomically
      await database.transaction(async (tx) => {
        await tx
          .update(answers)
          .set({
            selectedChoice: effectiveChoice,
            fileUrl1_1,
            fileUrl1_2,
            fileUrl1_3,
            fileUrl2_1,
            fileUrl2_2,
            fileUrl2_3,
            fileUrl3_1,
            fileUrl3_2,
            fileUrl3_3,
          })
          .where(eq(answers.id, existingAnswer.id));

        await tx.insert(answerLogs).values({ answerId: existingAnswer.id, status: "in_review" });
      });

      return { message: "answer update" };
    },

    negotiate: async (factoryId: number, dto: NegotiateAnswerDto, fiscalYear?: number) => {
      const targetYear = resolveWritableYear(fiscalYear);
      if (targetYear instanceof ElysiaCustomStatusResponse) return targetYear;

      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(targetYear);

      const cover = await database
        .select({ coverId: covers.id, enrollId: covers.enrollId })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!cover) return status(404, { message: "cover not found" });

      const latestCoverLog = await database
        .select({ status: coverLogs.status })
        .from(coverLogs)
        .where(eq(coverLogs.coverId, cover.coverId))
        .orderBy(desc(coverLogs.id))
        .limit(1)
        .then((res) => res[0]);

      if (!latestCoverLog || latestCoverLog.status !== "in_progress") {
        return status(400, { message: "negotiation only allowed when cover is in progress" });
      }

      const question = await database
        .select()
        .from(questions)
        .where(eq(questions.id, dto.questionId))
        .limit(1)
        .then((res) => res[0]);

      if (!question) return status(404, { message: "question not found" });

      const existingAnswer = await database
        .select()
        .from(answers)
        .where(and(eq(answers.coverId, cover.coverId), eq(answers.questionId, dto.questionId)))
        .limit(1)
        .then((res) => res[0]);

      if (!existingAnswer) return status(404, { message: "answer not found" });

      const latestLog = await database
        .select({ status: answerLogs.status, verdictChoice: answerLogs.verdictChoice })
        .from(answerLogs)
        .where(eq(answerLogs.answerId, existingAnswer.id))
        .orderBy(desc(answerLogs.id))
        .limit(1)
        .then((res) => res[0]);

      if (!latestLog || latestLog.status !== "rejected") {
        return status(400, { message: "answer is not in a state that can be negotiated" });
      }

      if (dto.action === "accept") {
        if (!latestLog.verdictChoice) {
          return status(400, { message: "hard-rejected answer cannot be accepted; redo instead" });
        }

        const effectiveChoice = latestLog.verdictChoice;

        // Standard question branch — force selectedChoice="3" and write recommended log
        if (question.standard.length > 0) {
          const enroll = await database
            .select()
            .from(enrolls)
            .where(eq(enrolls.id, cover.enrollId))
            .limit(1)
            .then((res) => res[0]);

          const standardBoolMap: Record<string, boolean | null | undefined> = {
            standardHC: enroll.standardHc,
            standardSAN: enroll.standardSan,
            standardSANPlus: enroll.standardSanPlus,
            standardWellness: enroll.standardWellness,
            standardSafety: enroll.standardSafety,
            standardTIS18001: enroll.standardTis18001,
            standardISO45001: enroll.standardIso45001,
            standardISO14001: enroll.standardIso14001,
            standardZero: enroll.standardZero,
            standard5S: enroll.standard5S,
            standardHAS: enroll.standardHas,
          };

          const factoryHasMatchingStandard = question.standard.some((s) => !!standardBoolMap[s]);

          if (factoryHasMatchingStandard) {
            await database.transaction(async (tx) => {
              await tx
                .update(answers)
                .set({ selectedChoice: "3" })
                .where(eq(answers.id, existingAnswer.id));
              await tx
                .insert(answerLogs)
                .values({ answerId: existingAnswer.id, status: "recommended" });
            });
            return status(200, { message: "answer accepted" });
          }
        }

        // Non-standard: validate that existing files satisfy the verdict choice requirements
        if (question.special === 3) {
          if (effectiveChoice === "1" && !existingAnswer.fileUrl1_1)
            return status(400, { message: "choice 1 requires file_1_1" });
          if (effectiveChoice === "2" && !existingAnswer.fileUrl2_1)
            return status(400, { message: "choice 2 requires file_2_1" });
          if (effectiveChoice === "3" && !existingAnswer.fileUrl3_1)
            return status(400, { message: "choice 3 requires file_3_1" });
        } else {
          if (effectiveChoice === "1" && !existingAnswer.fileUrl1_1)
            return status(400, { message: "choice 1 requires at least file_1_1" });
          if (effectiveChoice === "2" && (!existingAnswer.fileUrl1_1 || !existingAnswer.fileUrl2_1))
            return status(400, {
              message: "choice 2 requires at least file_1_1 and file_2_1",
            });
          if (
            effectiveChoice === "3" &&
            (!existingAnswer.fileUrl1_1 || !existingAnswer.fileUrl2_1 || !existingAnswer.fileUrl3_1)
          )
            return status(400, {
              message: "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
            });
        }

        // No MinIO changes on accept — files stay as-is
        await database.transaction(async (tx) => {
          await tx
            .update(answers)
            .set({ selectedChoice: effectiveChoice })
            .where(eq(answers.id, existingAnswer.id));
          await tx
            .insert(answerLogs)
            .values({ answerId: existingAnswer.id, status: "recommended" });
        });

        return status(200, { message: "answer accepted" });
      }

      // REDO branch (object or redo — factory re-answers with own evidence)

      // Standard question branch
      if (question.standard.length > 0) {
        const enroll = await database
          .select()
          .from(enrolls)
          .where(eq(enrolls.id, cover.enrollId))
          .limit(1)
          .then((res) => res[0]);

        const standardBoolMap: Record<string, boolean | null | undefined> = {
          standardHC: enroll.standardHc,
          standardSAN: enroll.standardSan,
          standardSANPlus: enroll.standardSanPlus,
          standardWellness: enroll.standardWellness,
          standardSafety: enroll.standardSafety,
          standardTIS18001: enroll.standardTis18001,
          standardISO45001: enroll.standardIso45001,
          standardISO14001: enroll.standardIso14001,
          standardZero: enroll.standardZero,
          standard5S: enroll.standard5S,
          standardHAS: enroll.standardHas,
        };

        const standardUrlMap: Record<string, string | null | undefined> = {
          standardHC: enroll.fileStandardHcUrl,
          standardSAN: enroll.fileStandardSanUrl,
          standardSANPlus: enroll.fileStandardSanPlusUrl,
          standardWellness: enroll.fileStandardWellnessUrl,
          standardSafety: enroll.fileStandardSafetyUrl,
          standardTIS18001: enroll.fileStandardTis18001Url,
          standardISO45001: enroll.fileStandardIso45001Url,
          standardISO14001: enroll.fileStandardIso14001Url,
          standardZero: enroll.fileStandardZeroUrl,
          standard5S: enroll.fileStandard5SUrl,
          standardHAS: enroll.fileStandardHasUrl,
        };

        const factoryHasMatchingStandard = question.standard.some((s) => !!standardBoolMap[s]);

        if (factoryHasMatchingStandard) {
          const hasFiles =
            dto.file_1_1 ||
            dto.file_1_2 ||
            dto.file_1_3 ||
            dto.file_2_1 ||
            dto.file_2_2 ||
            dto.file_2_3 ||
            dto.file_3_1 ||
            dto.file_3_2 ||
            dto.file_3_3;

          if (hasFiles) return status(400, { message: "standard question does not accept files" });

          const hasMatchingFile = question.standard.some((s) => !!standardUrlMap[s]);
          if (!hasMatchingFile)
            return status(404, { message: "standard file not found in enroll" });

          await database.transaction(async (tx) => {
            await tx
              .update(answers)
              .set({ selectedChoice: "3" })
              .where(eq(answers.id, existingAnswer.id));
            await tx
              .insert(answerLogs)
              .values({ answerId: existingAnswer.id, status: "in_review" });
          });

          return status(200, { message: "answer redone" });
        }
      }

      const effectiveChoice = dto.selectedChoice ?? existingAnswer.selectedChoice;

      // File validation — new DTO file OR existing DB URL satisfies requirement
      if (question.special === 3) {
        if (effectiveChoice === "1" && !dto.file_1_1 && !existingAnswer.fileUrl1_1)
          return status(400, { message: "choice 1 requires file_1_1" });
        if (effectiveChoice === "2" && !dto.file_2_1 && !existingAnswer.fileUrl2_1)
          return status(400, { message: "choice 2 requires file_2_1" });
        if (effectiveChoice === "3" && !dto.file_3_1 && !existingAnswer.fileUrl3_1)
          return status(400, { message: "choice 3 requires file_3_1" });
      } else {
        if (effectiveChoice === "1" && !dto.file_1_1 && !existingAnswer.fileUrl1_1)
          return status(400, { message: "choice 1 requires at least file_1_1" });
        if (
          effectiveChoice === "2" &&
          ((!dto.file_1_1 && !existingAnswer.fileUrl1_1) ||
            (!dto.file_2_1 && !existingAnswer.fileUrl2_1))
        )
          return status(400, { message: "choice 2 requires at least file_1_1 and file_2_1" });
        if (
          effectiveChoice === "3" &&
          ((!dto.file_1_1 && !existingAnswer.fileUrl1_1) ||
            (!dto.file_2_1 && !existingAnswer.fileUrl2_1) ||
            (!dto.file_3_1 && !existingAnswer.fileUrl3_1))
        )
          return status(400, {
            message: "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
          });
      }

      const processAnswerFile = async (
        newFile: File | undefined,
        oldUrl: string | null | undefined,
      ) => {
        if (newFile) {
          if (oldUrl) await utilities().deleteFile(oldUrl);
          return await utilities().uploadFile(newFile);
        }
        return oldUrl ?? null;
      };

      const clearFile = async (oldUrl: string | null | undefined) => {
        if (oldUrl) await utilities().deleteFile(oldUrl);
        return null;
      };

      let fileUrl1_1: string | null,
        fileUrl1_2: string | null,
        fileUrl1_3: string | null,
        fileUrl2_1: string | null,
        fileUrl2_2: string | null,
        fileUrl2_3: string | null,
        fileUrl3_1: string | null,
        fileUrl3_2: string | null,
        fileUrl3_3: string | null;

      if (question.special === 3) {
        const g1 = effectiveChoice === "1";
        const g2 = effectiveChoice === "2";
        const g3 = effectiveChoice === "3";

        [
          fileUrl1_1,
          fileUrl1_2,
          fileUrl1_3,
          fileUrl2_1,
          fileUrl2_2,
          fileUrl2_3,
          fileUrl3_1,
          fileUrl3_2,
          fileUrl3_3,
        ] = await Promise.all([
          g1
            ? processAnswerFile(dto.file_1_1, existingAnswer.fileUrl1_1)
            : clearFile(existingAnswer.fileUrl1_1),
          g1
            ? processAnswerFile(dto.file_1_2, existingAnswer.fileUrl1_2)
            : clearFile(existingAnswer.fileUrl1_2),
          g1
            ? processAnswerFile(dto.file_1_3, existingAnswer.fileUrl1_3)
            : clearFile(existingAnswer.fileUrl1_3),
          g2
            ? processAnswerFile(dto.file_2_1, existingAnswer.fileUrl2_1)
            : clearFile(existingAnswer.fileUrl2_1),
          g2
            ? processAnswerFile(dto.file_2_2, existingAnswer.fileUrl2_2)
            : clearFile(existingAnswer.fileUrl2_2),
          g2
            ? processAnswerFile(dto.file_2_3, existingAnswer.fileUrl2_3)
            : clearFile(existingAnswer.fileUrl2_3),
          g3
            ? processAnswerFile(dto.file_3_1, existingAnswer.fileUrl3_1)
            : clearFile(existingAnswer.fileUrl3_1),
          g3
            ? processAnswerFile(dto.file_3_2, existingAnswer.fileUrl3_2)
            : clearFile(existingAnswer.fileUrl3_2),
          g3
            ? processAnswerFile(dto.file_3_3, existingAnswer.fileUrl3_3)
            : clearFile(existingAnswer.fileUrl3_3),
        ]);
      } else {
        [
          fileUrl1_1,
          fileUrl1_2,
          fileUrl1_3,
          fileUrl2_1,
          fileUrl2_2,
          fileUrl2_3,
          fileUrl3_1,
          fileUrl3_2,
          fileUrl3_3,
        ] = await Promise.all([
          processAnswerFile(dto.file_1_1, existingAnswer.fileUrl1_1),
          processAnswerFile(dto.file_1_2, existingAnswer.fileUrl1_2),
          processAnswerFile(dto.file_1_3, existingAnswer.fileUrl1_3),
          processAnswerFile(dto.file_2_1, existingAnswer.fileUrl2_1),
          processAnswerFile(dto.file_2_2, existingAnswer.fileUrl2_2),
          processAnswerFile(dto.file_2_3, existingAnswer.fileUrl2_3),
          processAnswerFile(dto.file_3_1, existingAnswer.fileUrl3_1),
          processAnswerFile(dto.file_3_2, existingAnswer.fileUrl3_2),
          processAnswerFile(dto.file_3_3, existingAnswer.fileUrl3_3),
        ]);
      }

      await database.transaction(async (tx) => {
        await tx
          .update(answers)
          .set({
            selectedChoice: effectiveChoice,
            fileUrl1_1,
            fileUrl1_2,
            fileUrl1_3,
            fileUrl2_1,
            fileUrl2_2,
            fileUrl2_3,
            fileUrl3_1,
            fileUrl3_2,
            fileUrl3_3,
          })
          .where(eq(answers.id, existingAnswer.id));

        await tx.insert(answerLogs).values({ answerId: existingAnswer.id, status: "in_review" });
      });

      return status(200, { message: "answer redone" });
    },
  };
};

export const answerService = createAnswerService(db);
