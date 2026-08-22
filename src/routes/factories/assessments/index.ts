import { t } from "elysia";
import type { App } from "../../..";
import { factoryGuard } from "../../../middleware/guards";
import { BaseAnswerSelect, BaseCoverSelect, BaseQuestionSelect } from "../../../schema";
import {
  CreateAnswerWithFilesSchema,
  NegotiateAnswerSchema,
  UpdateAnswerWithFilesSchema,
} from "../../../schema/answer";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { answerService } from "../../../service/answer";
import { coverService } from "../../../service/cover";
import { questionService } from "../../../service/question";

export default (app: App) =>
  app.group("", { detail: { tags: ["factories"] } }, (group) =>
    group
      .use(factoryGuard)
      .get(
        "covers",
        async ({ jwtPayload, query }) => {
          const id = Number(jwtPayload.sub);
          return await coverService.getCoverById(id, query.fiscalYear);
        },
        {
          detail: {
            description: "เรียกดูข้อมูลหน้าปกแบบประเมินพร้อมสถานะล่าสุด",
          },
          query: FiscalYearQuery,
          response: {
            200: t.Composite([
              BaseCoverSelect,
              t.Object({
                status: t.String(),
                update_date: t.String(),
                fiscalYear: t.Optional(t.Number()),
              }),
            ]),
            404: t.Object({
              message: t.String({ default: "cover not found" }),
            }),
          },
        },
      )
      .post(
        "covers",
        async ({ jwtPayload }) => {
          const factoryId = Number(jwtPayload.sub);
          return await coverService.create(factoryId);
        },
        {
          detail: { description: "สร้างแบบประเมินตนเอง" },
          response: {
            201: t.Object({
              message: t.String({ default: "assessment cover created!" }),
            }),
            400: t.Object({
              message: t.String({
                default: "cover already exists for this enroll",
              }),
            }),
            404: t.Object({
              message: t.String({
                default: "enroll not found",
                description: "if factory do not enroll yet",
              }),
            }),
          },
        },
      )
      .get(
        "/questions",
        async () => {
          return await questionService.getAllQuestions();
        },
        {
          detail: { description: "ดึงข้อมูลคำถาม" },
          response: { 200: t.Array(BaseQuestionSelect) },
        },
      )
      .get(
        "/answers",
        async ({ jwtPayload, query }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.getAnswerByFactoryId(factoryId, query.fiscalYear);
        },
        {
          detail: { description: "ดึงข้อมูลคำตอบ" },
          query: FiscalYearQuery,
          response: {
            200: t.Array(
              t.Composite([
                t.Omit(BaseAnswerSelect, ["id", "cover_id", "selectedChoice"]),
                t.Object({
                  selectedChoice: t.Union([
                    t.Literal("0"),
                    t.Literal("1"),
                    t.Literal("2"),
                    t.Literal("3"),
                    t.Literal("n/a"),
                  ]),
                  // Latest verdict for this answer (from answerLogs).
                  // status="rejected" => needs action; verdictChoice null on a
                  // rejected answer => hard reject (redo), set => proposed score change.
                  status: t.String(),
                  verdictChoice: t.Nullable(t.String()),
                  description: t.Nullable(t.String()),
                }),
              ]),
            ),
            404: t.Object({
              message: t.String({ default: "answers not found" }),
            }),
          },
        },
      )
      .post(
        "/answers",
        async ({ jwtPayload, body, query }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.saveAnswer(factoryId, body, query.fiscalYear);
        },
        {
          detail: { description: "บันทึกคำตอบ" },
          query: FiscalYearQuery,
          body: CreateAnswerWithFilesSchema,
          parse: "multipart/form-data",
          response: {
            201: t.Object({ message: t.String({ default: "answer save!" }) }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "existed answer",
                  description: "An answer for this question already exists on the current cover",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "standard question does not accept files",
                  description:
                    "Files were submitted for a question that is tied to a standard — use the enroll standard file instead",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "choice 1 requires at least file_1_1",
                  description: "selectedChoice=1 but file_1_1 was not provided",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "choice 2 requires at least file_1_1 and file_2_1",
                  description: "selectedChoice=2 but file_1_1 or file_2_1 was not provided",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
                  description:
                    "selectedChoice=3 but one or more of file_1_1, file_2_1, file_3_1 was not provided",
                }),
              }),
            ]),
            404: t.Union([
              t.Object({
                message: t.String({
                  default: "cover not found",
                  description:
                    "No assessment cover exists for the factory's current fiscal year enrollment",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "question not found",
                  description:
                    "The provided questionId does not match any question in the database",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "standard file not found in enroll",
                  description:
                    "Factory is enrolled for this standard but has not uploaded the standard file yet",
                }),
              }),
            ]),
          },
        },
      )
      .patch(
        "/answers",
        async ({ jwtPayload, body, query }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.update(factoryId, body, query.fiscalYear);
        },
        {
          detail: { description: "แก้ไขคำตอบของแบบประเมิน" },
          query: FiscalYearQuery,
          body: UpdateAnswerWithFilesSchema,
          parse: "multipart/form-data",
          response: {
            200: t.Object({ message: t.String({ default: "answer update" }) }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "answer cannot be updated in its current status",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "standard question does not accept files",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "choice 1 requires at least file_1_1",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "choice 2 requires at least file_1_1 and file_2_1",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
                }),
              }),
            ]),
            404: t.Union([
              t.Object({ message: t.String({ default: "cover not found" }) }),
              t.Object({
                message: t.String({ default: "question not found" }),
              }),
              t.Object({ message: t.String({ default: "answer not found" }) }),
              t.Object({
                message: t.String({
                  default: "standard file not found in enroll",
                }),
              }),
            ]),
          },
        },
      )
      .post(
        "/answers/negotiate",
        async ({ jwtPayload, body, query }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.negotiate(factoryId, body, query.fiscalYear);
        },
        {
          detail: { description: "รับหรือปฏิเสธคำตัดสินของผู้ตรวจประเมิน (accept/redo)" },
          query: FiscalYearQuery,
          body: NegotiateAnswerSchema,
          parse: "multipart/form-data",
          response: {
            200: t.Object({ message: t.String({ default: "answer accepted" }) }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "negotiation only allowed when cover is in progress",
                }),
              }),
              t.Object({
                message: t.String({ default: "answer is not in a state that can be negotiated" }),
              }),
              t.Object({
                message: t.String({
                  default: "hard-rejected answer cannot be accepted; redo instead",
                }),
              }),
              t.Object({ message: t.String({ default: "choice 1 requires at least file_1_1" }) }),
            ]),
            404: t.Union([
              t.Object({ message: t.String({ default: "cover not found" }) }),
              t.Object({ message: t.String({ default: "question not found" }) }),
              t.Object({ message: t.String({ default: "answer not found" }) }),
            ]),
          },
        },
      )
      .post(
        "/submission",
        async ({ jwtPayload, query }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.submit(factoryId, query.fiscalYear);
        },
        {
          detail: { description: "ส่งคำตอบทั้งชุด" },
          query: FiscalYearQuery,
          response: {
            200: t.Object({ message: t.String({ default: "answers submit" }) }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "cover is not in progress",
                  description:
                    'The cover\'s latest log status is not "in_progress" — already submitted or not started',
                }),
              }),
              t.Object({
                message: t.String({
                  default: "not all questions have been answered",
                  description:
                    "Number of answers in this cover is less than the total number of questions",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "submit blocked: some answers are still rejected",
                  description:
                    "One or more answers are still rejected — factory must accept or redo them first",
                }),
                rejectedAnswerIds: t.Optional(t.Array(t.Number())),
              }),
            ]),
            404: t.Object({
              message: t.String({
                default: "cover not found",
                description:
                  "No assessment cover exists for the factory's current fiscal year enrollment",
              }),
            }),
          },
        },
      ),
  );
