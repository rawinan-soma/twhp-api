import { t } from "elysia";
import { App } from "../../../index";
import { adminGuard } from "../../../middleware/guards";
import { BaseEnrollSelect } from "../../../schema";
import { enrollService } from "../../../service/enroll";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async () => {
        return await enrollService.getAllEnrolls();
      },
      {
        detail: { description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมด" },
        response: t.Array(
          t.Composite([
            BaseEnrollSelect,
            t.Object({
              factory_name_th: t.String(),
              region: t.Number(),
              provinceId: t.Number(),
            }),
          ]),
        ),
      },
    ),
  );
