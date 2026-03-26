import Elysia, { t } from "elysia";
import { CreateFactorySchema, UpdateFactorySchema } from "../schema/factory";
import { factoryService } from "../service/factory";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../service/authentication";
import { CreateEnrollWithFilesSchema, UpdateEnrollWithFilesSchema } from "../schema/enroll";
import { BaseAnswerSelect, BaseEnrollSelect, BaseQuestionSelect } from "../schema";
import { CreateAnswerWithFilesSchema } from "../schema/answer";
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
    detail: { summary: "ลงทะเบียนสปก." },
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
          detail: { summary: "อัปเดตข้อมูลสปก." },
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
          detail: { summary: "ลงทะเบียนการสมัครเข้าร่วมโครงการ" },
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
          detail: { summary: "ดึงข้อมูลการสมัครเข้าร่วมโครงการตาม id" },
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
        },
        {
          detail: { summary: "อัปเดตข้อมูลการสมัครเข้าร่วมโครงการ" },
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
      .post(
        "covers",
        async ({ jwtPayload }) => {
          const factoryId = Number(jwtPayload.sub);
          return await coverService.create(factoryId);
        },
        {
          detail: { summary: "สร้างแบบประเมินตนเอง" },
          response: {
            201: t.Object({
              message: t.String({ default: "assessment cover created!" }),
            }),
            400: t.Object({
              message: t.String({ default: "cover already exists for this enroll" }),
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
          detail: { summary: "ดึงข้อมูลคำถาม" },
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
          detail: { summary: "ดึงข้อมูลคำตอบ" },
          response: {
            200: t.Array(t.Omit(BaseAnswerSelect, ["id", "cover_id"])),
            404: t.Object({ message: t.String({ default: "answers not found" }) }),
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
          detail: { summary: "บันทึกคำตอบ" },
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
                  default: "standard HC file not found in enroll",
                  description:
                    "The question requires a standard but the matching standard file URL is missing from the factory's enroll",
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
                  description: "selectedChoice=3 but one or more of file_1_1, file_2_1, file_3_1 was not provided",
                }),
              }),
            ]),
            404: t.Union([
              t.Object({
                message: t.String({
                  default: "cover not found",
                  description: "No assessment cover exists for the factory's current fiscal year enrollment",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "question not found",
                  description: "The provided questionId does not match any question in the database",
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
          detail: { summary: "ส่งคำตอบทั้งชุด" },
          response: {
            200: t.Object({ message: t.String({ default: "answers submit" }) }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "cover is not in progress",
                  description: 'The cover\'s latest log status is not "in_progress" — already submitted or not started',
                }),
              }),
              t.Object({
                message: t.String({
                  default: "not all questions have been answered",
                  description: "Number of answers in this cover is less than the total number of questions",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "not all answers are in review status",
                  description: 'One or more answers have a latest log status other than "in_review"',
                }),
              }),
            ]),
            404: t.Object({
              message: t.String({
                default: "cover not found",
                description: "No assessment cover exists for the factory's current fiscal year enrollment",
              }),
            }),
          },
        },
      ),
  );
