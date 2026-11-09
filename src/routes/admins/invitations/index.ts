import { t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import {
  CorrectInvitationEmailBody,
  CreateInvitationBody,
  InvitationIdParams,
} from "../../../schema/invitation";
import { invitationService } from "../../../service/invitation";

const pendingInvitationRoutes = (app: App) =>
  app.group("/:id", { detail: { tags: ["admins"] }, params: InvitationIdParams }, (group) =>
    group
      .use(adminGuard)
      .post("/resend", async ({ params: { id } }) => await invitationService.resend(id), {
        detail: { description: "ส่งลิงก์คำเชิญใหม่ ลิงก์เดิมจะใช้ไม่ได้และมีอายุใหม่ 10 นาที" },
        response: {
          200: t.Object({ message: t.String({ default: "invitation resent" }) }),
          404: t.Object({ message: t.String({ default: "invitation not found" }) }),
        },
      })
      .patch(
        "/email",
        async ({ params: { id }, body: { email } }) =>
          await invitationService.correctEmail(id, email),
        {
          detail: { description: "แก้ไขอีเมลของคำเชิญที่ยังไม่ตอบรับ และส่งลิงก์ใหม่ไปยังอีเมลที่แก้ไข" },
          body: CorrectInvitationEmailBody,
          response: {
            200: t.Object({ message: t.String({ default: "invitation email corrected" }) }),
            400: t.Union([
              t.Object({ message: t.String({ default: "email already exists" }) }),
              t.Object({ message: t.String({ default: "email already invited" }) }),
            ]),
            404: t.Object({ message: t.String({ default: "invitation not found" }) }),
          },
        },
      )
      .delete("", async ({ params: { id } }) => await invitationService.cancel(id), {
        detail: { description: "ยกเลิกคำเชิญที่ยังไม่ตอบรับ และลบคำเชิญออกจากระบบ" },
        response: {
          200: t.Object({ message: t.String({ default: "invitation cancelled" }) }),
          404: t.Object({ message: t.String({ default: "invitation not found" }) }),
        },
      }),
  );

export default (app: App) =>
  pendingInvitationRoutes(app).group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).post("", async ({ body }) => await invitationService.create(body), {
      detail: { description: "เชิญบุคคลทางอีเมล บัญชีจะถูกสร้างเมื่อผู้รับตอบรับคำเชิญ" },
      body: CreateInvitationBody,
      response: {
        201: t.Object({ id: t.Number(), message: t.String({ default: "invitation sent" }) }),
        400: t.Union([
          t.Object({ message: t.String({ default: "email already exists" }) }),
          t.Object({ message: t.String({ default: "email already invited" }) }),
          t.Object({ message: t.String({ default: "health region not found" }) }),
          t.Object({ message: t.String({ default: "province not found" }) }),
        ]),
      },
    }),
  );
