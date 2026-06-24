import { t } from "elysia";
import type { App } from "../../../index";
import { adminGuard } from "../../../middleware/guards";
import { CoverStatusQuery, EnrollWithCoverListSchema } from "../../../schema/enroll";
import { enrollService } from "../../../service/enroll";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async ({ query }) => {
        return await enrollService.getAllEnrolls(undefined, undefined, query.coverStatus);
      },
      {
        detail: {
          description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมด (กรองตามสถานะ cover ได้ด้วย ?coverStatus=)",
        },
        query: t.Object({ coverStatus: CoverStatusQuery }),
        response: EnrollWithCoverListSchema,
      },
    ),
  );
