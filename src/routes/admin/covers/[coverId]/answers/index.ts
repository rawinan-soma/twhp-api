import { t } from "elysia";
import type { App } from "../../../../..";
import { adminGuard } from "../../../../../middleware/guards";
import { AnswerViewSchema } from "../../../../../schema/evaluator-review";
import {
  adminReviewerContext,
  evaluatorReviewService,
} from "../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["admin"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async ({ params: { coverId }, jwtPayload }) => {
        const reviewer = adminReviewerContext(Number(jwtPayload.sub));
        return await evaluatorReviewService.getAnswers(coverId, reviewer);
      },
      {
        detail: {
          description: "ดูคำตอบในฝาประเมิน (ผู้ดูแลระบบทำหน้าที่ ODPC ระดับประเทศ ไม่กรองตามภูมิภาค)",
        },
        params: t.Object({ coverId: t.Number() }),
        response: {
          200: AnswerViewSchema,
          404: t.Object({ message: t.String({ default: "cover not found" }) }),
        },
      },
    ),
  );
