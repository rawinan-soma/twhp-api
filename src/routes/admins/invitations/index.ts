import { t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { CreateInvitationBody } from "../../../schema/invitation";
import { invitationService } from "../../../service/invitation";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).post("", async ({ body }) => await invitationService.create(body), {
      detail: { description: "เชิญบุคคลเป็นผู้ประเมินทางอีเมล บัญชีจะถูกสร้างเมื่อผู้รับตอบรับคำเชิญ" },
      body: CreateInvitationBody,
      response: {
        201: t.Object({ id: t.Number(), message: t.String({ default: "invitation sent" }) }),
        400: t.Union([
          t.Object({ message: t.String({ default: "email already exists" }) }),
          t.Object({ message: t.String({ default: "email already invited" }) }),
          t.Object({ message: t.String({ default: "health region not found" }) }),
        ]),
      },
    }),
  );
