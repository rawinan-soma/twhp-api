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
            "ดูคำตอบในฝาประเมินของจังหวัดตนเอง (อ่านอย่างเดียว) — ระหว่างสถานะ in_review " +
            "คะแนนตัดสิน (verdict choice) และคำอธิบายของทุกคำตอบจะเป็น null และสถานะจะแสดงเป็น " +
            "in_review เสมอ จนกว่าฝาจะ finished จึงจะเห็นค่าเดียวกับผู้ประเมิน ฝาที่สถานะล่าสุดเป็น " +
            "in_progress หรืออยู่นอกจังหวัดของเจ้าหน้าที่จะได้ 404 เหมือนกัน",
        },
        params: t.Object({ coverId: t.Number() }),
        response: {
          200: AnswerViewSchema,
          404: t.Object({ message: t.String({ default: "cover not found" }) }),
        },
      },
    ),
  );
