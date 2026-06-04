import { t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { ScoreReportListSchema } from "../../../schema/score";
import { scoreService } from "../../../service/score";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async ({ query }) => {
        return await scoreService.getAllScores({
          region: query.region,
          provinceId: query.provinceId,
        });
      },
      {
        detail: { description: "ดูคะแนนประเมินโรงงานทั้งหมด (กรองตามเขต/จังหวัดได้)" },
        query: t.Object({
          region: t.Optional(t.Number()),
          provinceId: t.Optional(t.Number()),
        }),
        response: {
          200: ScoreReportListSchema,
        },
      },
    ),
  );
