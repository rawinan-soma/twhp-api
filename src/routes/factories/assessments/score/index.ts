import { t } from "elysia";
import type { App } from "../../../..";
import { factoryGuard } from "../../../../middleware/guards";
import { FiscalYearQuery } from "../../../../schema/fiscal-year";
import { ScoreReportSchema } from "../../../../schema/score";
import { scoreService } from "../../../../service/score";

export default (app: App) =>
  app.group("", { detail: { tags: ["factories"] } }, (group) =>
    group.use(factoryGuard).get(
      "",
      async ({ jwtPayload, query }) => {
        const factoryId = Number(jwtPayload.sub);
        return await scoreService.getScoreByFactory(factoryId, query.fiscalYear);
      },
      {
        detail: { description: "ดูคะแนนประเมินตนเองของโรงงาน" },
        query: FiscalYearQuery,
        response: {
          200: ScoreReportSchema,
          400: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
        },
      },
    ),
  );
