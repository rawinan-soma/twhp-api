import { t } from "elysia";
import type { App } from "../../../index";
import { adminGuard } from "../../../middleware/guards";
import { CoverStatusQuery, EnrollWithCoverPageSchema } from "../../../schema/enroll";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { PaginationQuery } from "../../../schema/pagination";
import { enrollService } from "../../../service/enroll";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async ({ query }) => {
        return await enrollService.getAllEnrolls(undefined, undefined, query.coverStatus, {
          page: query.page,
          limit: query.limit,
          fiscalYear: query.fiscalYear,
        });
      },
      {
        detail: {
          description:
            "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมด (กรองตามสถานะ cover ได้ด้วย ?coverStatus= และแบ่งหน้าด้วย ?page= ?limit=)",
        },
        query: t.Composite([
          t.Object({ coverStatus: CoverStatusQuery }),
          PaginationQuery,
          FiscalYearQuery,
        ]),
        response: EnrollWithCoverPageSchema,
      },
    ),
  );
