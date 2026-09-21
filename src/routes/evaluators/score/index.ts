import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../..";
import { evalGuard } from "../../../middleware/guards";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { PaginationQuery } from "../../../schema/pagination";
import { ScoreReportPageSchema } from "../../../schema/score";
import { evaluatorService } from "../../../service/evaluator";
import { scoreService } from "../../../service/score";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ jwtPayload, query }) => {
        const evaluatorData = await evaluatorService.helper.getEvaluatorData(
          Number(jwtPayload.sub),
        );
        if (evaluatorData instanceof ElysiaCustomStatusResponse) return evaluatorData;
        return await scoreService.getScoresByRegion(
          // biome-ignore lint/style/noNonNullAssertion: evaluator is guaranteed non-null after getEvaluatorData succeeds
          evaluatorData.evaluator!.region,
          { page: query.page, limit: query.limit, fiscalYear: query.fiscalYear },
        );
      },
      {
        detail: {
          description: "ดูคะแนนประเมินโรงงานทั้งหมดในเขตสุขภาพ (แบ่งหน้าด้วย ?page= ?limit=)",
        },
        query: t.Composite([PaginationQuery, FiscalYearQuery]),
        response: {
          200: ScoreReportPageSchema,
          404: t.Object({ message: t.String({ default: "invalid evaluator" }) }),
        },
      },
    ),
  );
