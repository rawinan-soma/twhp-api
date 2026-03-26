import { db } from "../drizzle";
import { answers, answerLogs, covers, coverLogs, enrolls, questions } from "../drizzle/schema";
import { and, count, desc, eq, getTableColumns, gte, lt } from "drizzle-orm";
import { status } from "elysia";
import { utilities } from "../utils";
import { CreateAnswerWithFilesDto } from "../schema/answer";

export const createAnswerService = (database: typeof db) => {
  return {
    saveAnswer: async (factoryId: number, dto: CreateAnswerWithFilesDto) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

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

      // Standard question: no files allowed, verify enroll standard file exists
      if (question.standard.length > 0) {
        if (hasFiles) {
          return status(400, { message: "standard question does not accept files" });
        }

        const enroll = await database
          .select()
          .from(enrolls)
          .where(eq(enrolls.id, cover.enrollId))
          .limit(1)
          .then((res) => res[0]);

        const standardUrlMap: Record<string, string | null | undefined> = {
          HC: enroll.fileStandardHcUrl,
          SAN: enroll.fileStandardSanUrl,
          SANPlus: enroll.fileStandardSanPlusUrl,
          wellness: enroll.fileStandardWellnessUrl,
          safety: enroll.fileStandardSafetyUrl,
          TIS18001: enroll.fileStandardTis18001Url,
          ISO45001: enroll.fileStandardIso45001Url,
          ISO14001: enroll.fileStandardIso14001Url,
          zero: enroll.fileStandardZeroUrl,
          "5S": enroll.fileStandard5SUrl,
          HAS: enroll.fileStandardHasUrl,
        };

        const hasStandardFile = question.standard.some((s) => !!standardUrlMap[s]);
        if (!hasStandardFile) {
          return status(400, {
            message: `none of the required standards (${question.standard.join(", ")}) have a file in the enroll`,
          });
        }

        // No file uploads needed — insert answer + log in one transaction
        await database.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(answers)
            .values({ questionId: dto.questionId, coverId: cover.coverId, selectedChoice: dto.selectedChoice })
            .returning({ id: answers.id });

          await tx.insert(answerLogs).values({ answerId: inserted.id, status: "in_review" });
        });

        return status(201, { message: "answer save!" });
      }

      // Non-standard: validate files based on selected choice
      const choice = dto.selectedChoice;

      // choice "0" and "n/a" require no files — skip upload and go straight to transaction
      if (choice === "0" || choice === "n/a") {
        await database.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(answers)
            .values({ questionId: dto.questionId, coverId: cover.coverId, selectedChoice: dto.selectedChoice })
            .returning({ id: answers.id });

          await tx.insert(answerLogs).values({ answerId: inserted.id, status: "in_review" });
        });

        return status(201, { message: "answer save!" });
      }

      if (choice === "1" && !dto.file_1_1) {
        return status(400, { message: "choice 1 requires at least file_1_1" });
      }
      if (choice === "2" && (!dto.file_1_1 || !dto.file_2_1)) {
        return status(400, { message: "choice 2 requires at least file_1_1 and file_2_1" });
      }
      if (choice === "3" && (!dto.file_1_1 || !dto.file_2_1 || !dto.file_3_1)) {
        return status(400, { message: "choice 3 requires at least file_1_1, file_2_1, and file_3_1" });
      }

      // Upload files outside the transaction so DB connection is not held during I/O
      const uploadIfExists = (file: File | undefined) => (file ? utilities().uploadFile(file) : Promise.resolve(null));

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

    submit: async (factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const cover = await database
        .select({ coverId: covers.id })
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
        .selectDistinctOn([answerLogs.answerId], { status: answerLogs.status })
        .from(answerLogs)
        .innerJoin(answers, eq(answers.id, answerLogs.answerId))
        .where(eq(answers.coverId, cover.coverId))
        .orderBy(answerLogs.answerId, desc(answerLogs.id));

      const notInReview = latestAnswerLogs.some((log) => log.status !== "in_review");
      if (notInReview) {
        return status(400, { message: "not all answers are in review status" });
      }

      await database.insert(coverLogs).values({ coverId: cover.coverId, status: "in_review" });

      return status(200, { message: "answers submit" });
    },

    getAnswerByFactoryId: async (factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
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
      return result;
    },
  };
};

export const answerService = createAnswerService(db);
