import { ElysiaCustomStatusResponse, status, t } from "elysia";
import type { App } from "../../..";
import { officerGuard } from "../../../middleware/guards";
import { ScoreReportListSchema } from "../../../schema/score";
import { scoreService } from "../../../service/score";
import { provincialOfficerService } from "../../../service/provincialOfficer";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload }) => {
        const po = await provincialOfficerService.getOfficerDataById(Number(jwtPayload.sub));
        if (po instanceof ElysiaCustomStatusResponse)
          return status(404, { message: "provincial officer not found" });
        return await scoreService.getScoresByProvince(po.provinceId);
      },
      {
        detail: { description: "ดูคะแนนประเมินโรงงานทั้งหมดในจังหวัด" },
        response: {
          200: ScoreReportListSchema,
          404: t.Object({ message: t.String({ default: "provincial officer not found" }) }),
        },
      },
    ),
  );
