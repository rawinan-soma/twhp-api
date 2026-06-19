import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../../../..";
import { evalGuard } from "../../../../../middleware/guards";
import { AnswerViewSchema } from "../../../../../schema/evaluator-review";
import { evaluatorReviewService } from "../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ params: { coverId }, jwtPayload }) => {
        const reviewer = await evaluatorReviewService.resolveEvaluator(Number(jwtPayload.sub));
        if (reviewer instanceof ElysiaCustomStatusResponse) return reviewer;
        return await evaluatorReviewService.getAnswers(coverId, reviewer);
      },
      {
        detail: { description: "ดูคำตอบในฝาประเมิน กรองตาม level ของผู้ประเมิน" },
        params: t.Object({ coverId: t.Number() }),
        response: {
          200: AnswerViewSchema,
          404: t.Object({ message: t.String({ default: "cover not found" }) }),
        },
      },
    ),
  );
