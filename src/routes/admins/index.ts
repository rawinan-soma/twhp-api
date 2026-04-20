import { t } from "elysia";
import { App } from "../..";
import { UpdateAdminSchema } from "../../schema/admin";
import { adminService } from "../../service/admin";
import { adminGuard } from "../../middleware/guards";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).patch(
      "",
      async ({ body, jwtPayload }) => {
        const id = Number(jwtPayload.sub);
        return await adminService.editAdminData(id, body);
      },
      {
        detail: { description: "แก้ไขข้อมูลของ admin" },
        body: UpdateAdminSchema,
        response: {
          200: t.Object({
            message: t.String({ default: "admin updated!" }),
          }),
          400: t.Object({
            message: t.String({ default: "admin not found" }),
          }),
        },
      },
    ),
  );
