import { t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { BaseEnrollSelect } from "../../../schema";
import { enrollService } from "../../../service/enroll";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async ({ params }) => {
        return await enrollService.getEnrollById(params.id);
      },
      {
        detail: { description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการตาม id" },
        params: t.Object({ id: t.Number() }),
        response: {
          200: t.Composite([
            BaseEnrollSelect,
            t.Object({
              province_name_th: t.Nullable(t.String()),
              district_name_th: t.Nullable(t.String()),
              subdistrict_name_th: t.Nullable(t.String()),
            }),
          ]),
          404: t.Object({
            message: t.String({ default: "enroll not found" }),
          }),
        },
      },
    ),
  );
