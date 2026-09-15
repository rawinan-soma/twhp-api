import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../..";
import { evalGuard } from "../../../middleware/guards";
import { BaseEnrollSelect } from "../../../schema";
import { enrollService } from "../../../service/enroll";
import { evaluatorService } from "../../../service/evaluator";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ jwtPayload, params: { id } }) => {
        const evaluatorData = await evaluatorService.helper.getEvaluatorData(
          Number(jwtPayload.sub),
        );

        if (evaluatorData instanceof ElysiaCustomStatusResponse) {
          return evaluatorData;
        }

        // biome-ignore lint/style/noNonNullAssertion: evaluator is guaranteed non-null after getEvaluatorData succeeds
        const evaluatorRegion = evaluatorData.evaluator!.region;
        return await enrollService.getEnrollById(id, undefined, evaluatorRegion);
      },
      {
        detail: { description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการตาม id" },
        params: t.Object({ id: t.Number() }),
        response: {
          200: t.Composite([
            BaseEnrollSelect,
            t.Object({
              province_name_th: t.Nullable(t.String()),
              district_name_th: t.Nullable(t.String()),
              subdistrict_name_th: t.Nullable(t.String()),
            }),
          ]),
          404: t.Object({
            message: t.String({ default: "enroll not found" }),
          }),
        },
      },
    ),
  );
