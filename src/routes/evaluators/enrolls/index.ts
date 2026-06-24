import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../..";
import { evalGuard } from "../../../middleware/guards";
import { CoverStatusQuery, EnrollWithCoverListSchema } from "../../../schema/enroll";
import { enrollService } from "../../../service/enroll";
import { evaluatorService } from "../../../service/evaluator";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ jwtPayload, query }) => {
        const region = await evaluatorService.helper.getEvaluatorData(Number(jwtPayload.sub));

        if (region instanceof ElysiaCustomStatusResponse) {
          return region;
        }

        // biome-ignore lint/style/noNonNullAssertion: evaluator is guaranteed non-null after getEvaluatorData succeeds
        const evaluatorRegion = region.evaluator!.region;
        return await enrollService.getAllEnrolls(evaluatorRegion, undefined, query.coverStatus);
      },
      {
        detail: {
          description:
            "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมดตามเขตสุขภาพ (กรองตามสถานะ cover ได้ด้วย ?coverStatus=)",
        },
        query: t.Object({ coverStatus: CoverStatusQuery }),
        response: {
          200: EnrollWithCoverListSchema,
          404: t.Object({
            message: t.String({ default: "invalid evaluator" }),
          }),
        },
      },
    ),
  );
