import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../../../..";
import { evalGuard } from "../../../../../middleware/guards";
import { VerdictBatchSchema } from "../../../../../schema/evaluator-review";
import { GradeSchema } from "../../../../../schema/score";
import { evaluatorReviewService } from "../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).post(
      "",
      async ({ params: { coverId }, body, jwtPayload }) => {
        const reviewer = await evaluatorReviewService.resolveEvaluator(Number(jwtPayload.sub));
        if (reviewer instanceof ElysiaCustomStatusResponse) return reviewer;
        return await evaluatorReviewService.verdict(coverId, reviewer, body);
      },
      {
        detail: { description: "บันทึกคำตัดสินแบบ batch (หนึ่ง transaction)" },
        params: t.Object({ coverId: t.Number() }),
        body: VerdictBatchSchema,
        response: {
          200: t.Object({
            message: t.String({ default: "verdict submitted" }),
            grade: t.Optional(t.Nullable(GradeSchema)),
          }),
          400: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String({ default: "cover not found" }) }),
        },
      },
    ),
  );
