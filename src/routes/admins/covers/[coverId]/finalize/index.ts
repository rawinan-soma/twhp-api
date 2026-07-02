import { t } from "elysia";
import type { App } from "../../../../..";
import { adminGuard } from "../../../../../middleware/guards";
import { FinalizeSchema } from "../../../../../schema/evaluator-review";
import { GradeSchema } from "../../../../../schema/score";
import {
  adminReviewerContext,
  evaluatorReviewService,
} from "../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).post(
      "",
      async ({ params: { coverId }, jwtPayload }) => {
        const reviewer = adminReviewerContext(Number(jwtPayload.sub));
        return await evaluatorReviewService.finalize(coverId, reviewer);
      },
      {
        detail: {
          description:
            "สรุปผลทั้งฝาประเมิน (ผู้ดูแลระบบทำหน้าที่ ODPC ระดับประเทศ; อ่าน answerLogs ล่าสุด, gate in_review, แปลง recommended→finished, บันทึก transition, คำนวณเกรด, ส่งอีเมล)",
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
