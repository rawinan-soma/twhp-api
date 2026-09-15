import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../../../..";
import { officerGuard } from "../../../../../middleware/guards";
import { AnswerViewSchema } from "../../../../../schema/evaluator-review";
import { evaluatorReviewService } from "../../../../../service/evaluator-review";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ params: { coverId }, jwtPayload }) => {
        const reviewer = await evaluatorReviewService.resolveProvincialOfficer(
          Number(jwtPayload.sub),
        );
        if (reviewer instanceof ElysiaCustomStatusResponse) return reviewer;
        return await evaluatorReviewService.getAnswers(coverId, reviewer);
      },
      {
        detail: {
          description:
            "ดูคำตอบในฝาประเมินของจังหวัด (read-only) — ต้องมีสถานะ in_review หรือ finished เท่านั้น " +
            "ขณะ in_review ผลตัดสิน (verdict choice/description) และสถานะรายข้อจะถูกซ่อนเป็น null/in_review " +
            "ใบรับรองมาตรฐานแสดงผลไม่ถูกซ่อนทั้งสองสถานะ",
        },
        params: t.Object({ coverId: t.Number() }),
        response: {
          200: AnswerViewSchema,
          404: t.Object({ message: t.String({ default: "cover not found" }) }),
        },
      },
    ),
  );
