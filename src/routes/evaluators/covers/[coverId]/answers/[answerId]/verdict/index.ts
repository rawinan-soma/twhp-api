import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../../../../../..";
import { evalGuard } from "../../../../../../../middleware/guards";
import { VerdictSaveBodySchema } from "../../../../../../../schema/evaluator-review";
import { evaluatorReviewService } from "../../../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).post(
      "",
      async ({ params: { coverId, answerId }, body, jwtPayload }) => {
        const reviewer = await evaluatorReviewService.resolveEvaluator(Number(jwtPayload.sub));
        if (reviewer instanceof ElysiaCustomStatusResponse) return reviewer;
        return await evaluatorReviewService.saveAnswerVerdict(coverId, answerId, reviewer, body);
      },
      {
        detail: {
          description:
            "บันทึกคำตัดสินรายข้อ (per-Answer save; ต่อท้าย answerLogs หนึ่งแถว, ไม่มี side effect)",
        },
        params: t.Object({ coverId: t.Number(), answerId: t.Number() }),
        body: VerdictSaveBodySchema,
        response: {
          200: t.Object({
            message: t.String({ default: "verdict saved" }),
            answerId: t.Number(),
            status: t.String(),
          }),
          400: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String({ default: "cover not found" }) }),
        },
      },
    ),
  );
