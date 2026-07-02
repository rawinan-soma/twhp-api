import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../../../..";
import { evalGuard } from "../../../../../middleware/guards";
import { FinalizeSchema } from "../../../../../schema/evaluator-review";
import { GradeSchema } from "../../../../../schema/score";
import { evaluatorReviewService } from "../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).post(
      "",
      async ({ params: { coverId }, jwtPayload }) => {
        const reviewer = await evaluatorReviewService.resolveEvaluator(Number(jwtPayload.sub));
        if (reviewer instanceof ElysiaCustomStatusResponse) return reviewer;
        return await evaluatorReviewService.finalize(coverId, reviewer);
      },
      {
        detail: {
          description:
            "สรุปผลทั้งฝาประเมิน (ODPC เท่านั้น; อ่าน answerLogs ล่าสุด, gate in_review, แปลง recommended→finished, ลบไฟล์ที่ถูก reject, บันทึก transition, คำนวณเกรด, ส่งอีเมล)",
        },
        params: t.Object({ coverId: t.Number() }),
        body: FinalizeSchema,
        response: {
          200: t.Object({
            message: t.String({ default: "cover finalized" }),
            coverStatus: t.String(),
            grade: t.Nullable(GradeSchema),
          }),
          400: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String({ default: "cover not found" }) }),
          500: t.Object({ message: t.String() }),
        },
      },
    ),
  );
