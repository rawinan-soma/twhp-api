import { t } from "elysia";
import type { App } from "../../..";
import { factoryGuard } from "../../../middleware/guards";
import { BaseEnrollSelect } from "../../../schema";
import { CreateEnrollWithFilesSchema, UpdateEnrollWithFilesSchema } from "../../../schema/enroll";
import { enrollService } from "../../../service/enroll";

export default (app: App) =>
  app.group("", { detail: { tags: ["factories"] } }, (group) =>
    group
      .use(factoryGuard)
      .post(
        "",
        async ({ body, jwtPayload }) => {
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
  );
