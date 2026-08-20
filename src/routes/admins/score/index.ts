import { t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { PaginationQuery } from "../../../schema/pagination";
import { ScoreReportPageSchema } from "../../../schema/score";
import { scoreService } from "../../../service/score";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async ({ query }) => {
        return await scoreService.getAllScores(
          { region: query.region, provinceId: query.provinceId },
          { page: query.page, limit: query.limit },
        );
      },
      {
        detail: {
          description: "ดูคะแนนประเมินโรงงานทั้งหมด (กรองตามเขต/จังหวัดได้ และแบ่งหน้าด้วย ?page= ?limit=)",
        },
        query: t.Composite([
          t.Object({
            region: t.Optional(t.Number()),
            provinceId: t.Optional(t.Number()),
          }),
          PaginationQuery,
        ]),
        response: {
          200: ScoreReportPageSchema,
        },
      },
    ),
  );
