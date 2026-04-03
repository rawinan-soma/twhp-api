import Elysia, { t } from "elysia";
import { CreateFactorySchema, UpdateFactorySchema } from "../schema/factory";
import { factoryService } from "../service/factory";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../service/authentication";
import {
  CreateEnrollWithFilesSchema,
  UpdateEnrollWithFilesSchema,
} from "../schema/enroll";
import {
  BaseAnswerSelect,
  BaseCoverSelect,
  BaseEnrollSelect,
  BaseQuestionSelect,
} from "../schema";
import {
  CreateAnswerWithFilesSchema,
  UpdateAnswerWithFilesSchema,
} from "../schema/answer";
import { enrollService } from "../service/enroll";
import { coverService } from "../service/cover";
import { questionService } from "../service/question";
import { answerService } from "../service/answer";

const registerFactoryController = new Elysia().post(
  "/register",
  async ({ body }) => {
    return await factoryService.register(body);
  },
  {
    detail: { description: "ลงทะเบียนสปก." },
    body: CreateFactorySchema,
    response: {
      201: t.Object({
        message: t.String({ default: "factory created successfully" }),
      }),
      400: t.Object({
        message: t.String({ default: "factory already registered" }),
      }),
      404: t.Object({ message: t.String({ default: "location not found" }) }),
    },
  },
);

export const factoryController = new Elysia({
  prefix: "/factories",
  tags: ["factory"],
})
  .group("", (fc) => fc.use(registerFactoryController))
  .group("", (fc) =>
    fc
      .use(jwtPlugin)
      .use(requireRoles(Role.Factory))
      .patch(
        "",
        async ({ jwtPayload, body }) => {
          const id = Number(jwtPayload.sub);
          return await factoryService.update(id, body);
        },
        {
          detail: { description: "อัปเดตข้อมูลสปก." },
          body: UpdateFactorySchema,
          response: {
            200: t.Object({
              message: t.String({ default: "factory updated successfully" }),
            }),
            400: t.Object({
              message: t.String({ default: "invalid subdistrict id" }),
            }),
            404: t.Object({
              message: t.String({ default: "factory not found" }),
            }),
          },
        },
      ),
  )
  .group("/enrolls", (fc) =>
    fc
      .use(jwtPlugin)
      .use(requireRoles(Role.Factory))
      .post(
        "",
        async ({ body, jwtPayload, set }) => {
          const id = Number(jwtPayload.sub);
          return await enrollService.create(body, id);
        },
        {
          detail: { description: "ลงทะเบียนการสมัครเข้าร่วมโครงการ" },
          body: CreateEnrollWithFilesSchema,
          parse: "multipart/form-data",
          response: {
            201: t.Object({
              message: t.String({ default: "create enrollment successfully" }),
            }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "standard ... is issue but file is missing",
                  description: "Standard = true but no file",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "already make an enroll in fiscal year",
                  description: "existing enroll",
                }),
              }),
            ]),
          },
        },
      )
      .get(
        "",
        async ({ jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          return await enrollService.getEnrollByFactoryId(id);
        },
        {
          detail: { description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการของตนเอง" },
          response: t.Union([
            t.Partial(BaseEnrollSelect),
            t.Object({ message: t.String({ default: "no enrollment found" }) }),
          ]),
        },
      )
      .patch(
        "",
        async ({ jwtPayload, body }) => {
          const id = Number(jwtPayload.sub);
          return await enrollService.updateEnroll(id, body);
          /*
          Update logic
          - If file present in body delete old file in metadata and minio then update new file
          */
        },
        {
          detail: { description: "อัปเดตข้อมูลการสมัครเข้าร่วมโครงการ" },
          body: UpdateEnrollWithFilesSchema,
          response: {
            200: t.Object({
              message: t.String({ default: "enrollment updated successfully" }),
            }),
            404: t.Object({
              message: t.String({
                default: "Enroll not found for this fiscal year",
              }),
            }),
            400: t.Object({
              message: t.String({
                default: "standard ... is issue but file is missing",
                description: "Standard = true but no file",
              }),
            }),
          },
          parse: "multipart/form-data",
        },
      ),
  )
  .group("/assessments", (fc) =>
    fc
      .use(jwtPlugin)
      .use(requireRoles(Role.Factory))
      .get(
        "covers",
        async ({ jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          return await coverService.getCoverById(id);
          /*
        Business logic
        - Get cover data from factory id
        - Get only this fiscal year - fucntion is in utilities
        - Get along with latest status of cover in coverLogs
        */
        },
        {
          detail: {
            description: "เรียกดูข้อมูลหน้าปกแบบประเมินพร้อมสถานะล่าสุด",
          },
          response: {
            200: t.Composite([
              BaseCoverSelect,
              t.Object({ status: t.String(), update_date: t.String() }),
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
        async ({ jwtPayload }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.getAnswerByFactoryId(factoryId);
        },
        {
          detail: { description: "ดึงข้อมูลคำตอบ" },
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
        async ({ jwtPayload, body }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.saveAnswer(factoryId, body);
        },
        {
          detail: { description: "บันทึกคำตอบ" },
          body: CreateAnswerWithFilesSchema,
          parse: "multipart/form-data",
          response: {
            201: t.Object({ message: t.String({ default: "answer save!" }) }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "existed answer",
                  description:
                    "An answer for this question already exists on the current cover",
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
                  description:
                    "selectedChoice=2 but file_1_1 or file_2_1 was not provided",
                }),
              }),
              t.Object({
                message: t.String({
                  default:
                    "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
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
        async ({ jwtPayload, body }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.update(factoryId, body);
          /*
          Business logic
          - Check existing of answer - if not exists return status(404, {message: "answer not found"})
          - Check answer status in logs - status should be in in_review or rejected
          - Check standard file existing in body
            - If there standard are not null, file of relative standard must be present (files are in enrolls)
          - If selectedChoice = 1 at lease 1 file in file1_x must be present
          - If selectedChoice = 2 at lease 1 file in file1_x and file2_x must be present
          - If selectedChoice = 3 at lease 1 file in file1_x file2_x and file3_x must be present
          - If body has file present. delete old file in metadata and minio then upload new file
          - If selectedChoice are 0 or n/a. there are no file required
          Workflow: validation as above -> update data in answer -> write new log with the status in_review
          */
        },
        {
          detail: "แก้ไขคำตอบของแบบประเมิน",
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
                  default:
                    "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
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
        "/submission",
        async ({ jwtPayload }) => {
          const factoryId = Number(jwtPayload.sub);
          return await answerService.submit(factoryId);
        },
        {
          detail: { description: "ส่งคำตอบทั้งชุด" },
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
                  default: "not all answers are in review status",
                  description:
                    'One or more answers have a latest log status other than "in_review"',
                }),
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
