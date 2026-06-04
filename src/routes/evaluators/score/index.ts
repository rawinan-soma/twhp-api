import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../..";
import { evalGuard } from "../../../middleware/guards";
import { ScoreReportListSchema } from "../../../schema/score";
import { scoreService } from "../../../service/score";
import { evaluatorService } from "../../../service/evaluator";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ jwtPayload }) => {
        const evaluatorData = await evaluatorService.helper.getEvaluatorData(
          Number(jwtPayload.sub),
        );
        if (evaluatorData instanceof ElysiaCustomStatusResponse) return evaluatorData;
        // biome-ignore lint/style/noNonNullAssertion: evaluator is guaranteed non-null after getEvaluatorData succeeds
        return await scoreService.getScoresByRegion(evaluatorData.evaluator!.region);
      },
      {
        detail: { description: "ดูคะแนนประเมินโรงงานทั้งหมดในเขตสุขภาพ" },
        response: {
          200: ScoreReportListSchema,
          404: t.Object({ message: t.String({ default: "invalid evaluator" }) }),
        },
      },
    ),
  );
