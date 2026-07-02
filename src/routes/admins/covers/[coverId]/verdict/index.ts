import { t } from "elysia";
import type { App } from "../../../../..";
import { adminGuard } from "../../../../../middleware/guards";
import { VerdictBatchSchema } from "../../../../../schema/evaluator-review";
import { GradeSchema } from "../../../../../schema/score";
import {
  adminReviewerContext,
  evaluatorReviewService,
} from "../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).post(
      "",
      async ({ params: { coverId }, body, jwtPayload }) => {
        const reviewer = adminReviewerContext(Number(jwtPayload.sub));
        return await evaluatorReviewService.verdict(coverId, reviewer, body);
      },
      {
        detail: {
          description:
            "บันทึกคำตัดสินแบบ batch (ผู้ดูแลระบบทำหน้าที่ ODPC ระดับประเทศ, finalize ในหนึ่ง transaction)",
        },
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
