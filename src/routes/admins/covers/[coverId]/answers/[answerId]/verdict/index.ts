import { t } from "elysia";
import type { App } from "../../../../../../..";
import { adminGuard } from "../../../../../../../middleware/guards";
import { VerdictSaveBodySchema } from "../../../../../../../schema/evaluator-review";
import {
  adminReviewerContext,
  evaluatorReviewService,
} from "../../../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).post(
      "",
      async ({ params: { coverId, answerId }, body, jwtPayload }) => {
        const reviewer = adminReviewerContext(Number(jwtPayload.sub));
        return await evaluatorReviewService.saveAnswerVerdict(coverId, answerId, reviewer, body);
      },
      {
        detail: {
          description: "บันทึกคำตัดสินรายข้อ (ผู้ดูแลระบบทำหน้าที่ ODPC ระดับประเทศ; ต่อท้าย answerLogs หนึ่งแถว)",
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
