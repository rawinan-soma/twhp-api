import { ElysiaCustomStatusResponse, t } from "elysia";
import { App } from "../../..";
import { evalGuard } from "../../../middleware/guards";
import { evaluatorService } from "../../../service/evaluator";
import { enrollService } from "../../../service/enroll";
import { BaseEnrollSelect } from "../../../schema";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ jwtPayload }) => {
        const region = await evaluatorService.helper.getEvaluatorData(Number(jwtPayload.sub));

        if (region instanceof ElysiaCustomStatusResponse) {
          return region;
        }

        return await enrollService.getAllEnrolls(region.evaluator!.region);
      },
      {
        detail: {
          description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมดตามเขตสุขภาพ",
        },
        response: {
          200: t.Array(
            t.Composite([
              BaseEnrollSelect,
              t.Object({
                factory_name_th: t.String(),
                region: t.Number(),
                provinceId: t.Number(),
              }),
            ]),
          ),
          404: t.Object({
            message: t.String({ default: "invalid evaluator" }),
          }),
        },
      },
    ),
  );
