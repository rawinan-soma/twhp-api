import { ElysiaCustomStatusResponse, status, t } from "elysia";
import type { App } from "../../..";
import { officerGuard } from "../../../middleware/guards";
import { CoverStatusQuery, EnrollWithCoverPageSchema } from "../../../schema/enroll";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { PaginationQuery } from "../../../schema/pagination";
import { enrollService } from "../../../service/enroll";
import { provincialOfficerService } from "../../../service/provincialOfficer";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload, query }) => {
        const id = Number(jwtPayload.sub);
        const po = await provincialOfficerService.getOfficerDataById(id);
        if (po instanceof ElysiaCustomStatusResponse)
          return status(404, { message: "provincial officer not found" });
        const result = await enrollService.getAllEnrollsByProvince(
          po.provinceId,
          query.coverStatus,
          { page: query.page, limit: query.limit, fiscalYear: query.fiscalYear },
        );
        return result;
      },
      {
        detail: {
          description:
            "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมดของจังหวัด (กรองตามสถานะ cover ได้ด้วย ?coverStatus= และแบ่งหน้าด้วย ?page= ?limit=)",
        },
        query: t.Composite([
          t.Object({ coverStatus: CoverStatusQuery }),
          PaginationQuery,
          FiscalYearQuery,
        ]),
        response: {
          404: t.Object({ message: t.String({ default: "officer not found" }) }),
          200: EnrollWithCoverPageSchema,
        },
      },
    ),
  );
