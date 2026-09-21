import { ElysiaCustomStatusResponse, status, t } from "elysia";
import type { App } from "../../..";
import { officerGuard } from "../../../middleware/guards";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { PaginationQuery } from "../../../schema/pagination";
import { ScoreReportPageSchema } from "../../../schema/score";
import { provincialOfficerService } from "../../../service/provincialOfficer";
import { scoreService } from "../../../service/score";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload, query }) => {
        const po = await provincialOfficerService.getOfficerDataById(Number(jwtPayload.sub));
        if (po instanceof ElysiaCustomStatusResponse)
          return status(404, { message: "provincial officer not found" });
        return await scoreService.getScoresByProvince(po.provinceId, {
          page: query.page,
          limit: query.limit,
          fiscalYear: query.fiscalYear,
        });
      },
      {
        detail: {
          description: "ดูคะแนนประเมินโรงงานทั้งหมดในจังหวัด (แบ่งหน้าด้วย ?page= ?limit=)",
        },
        query: t.Composite([PaginationQuery, FiscalYearQuery]),
        response: {
          200: ScoreReportPageSchema,
          404: t.Object({ message: t.String({ default: "provincial officer not found" }) }),
        },
      },
    ),
  );
