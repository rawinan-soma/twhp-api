import { t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { AdminFactoryListItemSchema } from "../../../schema/factory";
import { Paginated, PaginationQuery } from "../../../schema/pagination";
import { adminService } from "../../../service/admin";
import { factoryService } from "../../../service/factory";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group
      .use(adminGuard)
      .get(
        "",
        async ({ query }) => {
          return await factoryService.getAllFactories(query);
        },
        {
          detail: {
            description: "ดึงข้อมูล สปก. ทั้งหมด (แบ่งหน้าด้วย ?page= และ ?limit=)",
          },
          query: t.Composite([
            t.Object({
              validated: t.Boolean(),
              enrolled: t.Optional(t.Boolean()),
            }),
            PaginationQuery,
          ]),
          response: Paginated(AdminFactoryListItemSchema),
        },
      )
      .patch(
        "/validate/:id",
        async ({ params }) => {
          return await adminService.approveFactoryRegister(params.id);
        },
        {
          detail: { description: "อนุมัติการลงทะเบียน" },
          params: t.Object({ id: t.Number() }),
          response: {
            200: t.Object({
              message: t.String({ default: "factory validated!" }),
            }),
            404: t.Object({
              message: t.String({ default: "factory not found" }),
            }),
            400: t.Object({
              message: t.String({ default: "factory already validated" }),
            }),
          },
        },
      ),
  );
