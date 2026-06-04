import { t } from "elysia";
import type { App } from "../../../..";
import { factoryGuard } from "../../../../middleware/guards";
import { ScoreReportSchema } from "../../../../schema/score";
import { scoreService } from "../../../../service/score";

export default (app: App) =>
  app.group("", { detail: { tags: ["factories"] } }, (group) =>
    group.use(factoryGuard).get(
      "",
      async ({ jwtPayload }) => {
        const factoryId = Number(jwtPayload.sub);
        return await scoreService.getScoreByFactory(factoryId);
      },
      {
        detail: { description: "ดูคะแนนประเมินตนเองของโรงงาน" },
        response: {
          200: ScoreReportSchema,
          400: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
        },
      },
    ),
  );
