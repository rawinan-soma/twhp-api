import { ElysiaCustomStatusResponse, status, t } from "elysia";
import { App } from "../../..";
import { evalGuard } from "../../../middleware/guards";
import { evaluatorService } from "../../../service/evaluator";
import { factoryService } from "../../../service/factory";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ query, jwtPayload }) => {
        const id = Number(jwtPayload.sub);
        const region = await evaluatorService.helper.getEvaluatorData(id);

        if (region instanceof ElysiaCustomStatusResponse) return region;

        return await factoryService.getAllFactoriesByRegion({
          validated: query.validated,
          enrolled: query.enrolled,
          region: region.evaluator!.region,
        });
      },
      {
        detail: { description: "ดึงข้อมูลสปก. ทั้งหมดตามเขตสุขภาพ" },
        query: t.Object({
          validated: t.Boolean(),
          enrolled: t.Optional(t.Boolean()),
        }),
        response: {
          200: t.Array(
            t.Object({
              province_name_th: t.Nullable(t.String()),
              district_name_th: t.Nullable(t.String()),
              subdistrict_name_th: t.Nullable(t.String()),
              account_id: t.Number(),
              factory_type: t.Number(),
              name_th: t.String(),
              name_en: t.String(),
              tsic_code: t.String(),
              address_no: t.String(),
              soi: t.Nullable(t.String()),
              road: t.Nullable(t.String()),
              zipcode: t.String(),
              phone_number: t.String(),
              fax_number: t.Nullable(t.String()),
              is_validate: t.Boolean(),
            }),
          ),
          404: t.Object({
            message: t.String({ default: "invalid evaluator" }),
          }),
        },
      },
    ),
  );
