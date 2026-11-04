import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../..";
import { evalGuard } from "../../../middleware/guards";
import { FactoryListItemSchema } from "../../../schema/factory";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { Paginated, PaginationQuery } from "../../../schema/pagination";
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
          page: query.page,
          limit: query.limit,
          fiscalYear: query.fiscalYear,
          // biome-ignore lint/style/noNonNullAssertion: evaluator is guaranteed non-null after getEvaluatorData succeeds
          region: region.evaluator!.region,
        });
      },
      {
        detail: {
          description: "ดึงข้อมูลสปก. ทั้งหมดตามเขตสุขภาพ (แบ่งหน้าด้วย ?page= และ ?limit=)",
        },
        query: t.Composite([
          t.Object({
            validated: t.Boolean(),
            enrolled: t.Optional(t.Boolean()),
          }),
          PaginationQuery,
          FiscalYearQuery,
        ]),
        response: {
          200: Paginated(FactoryListItemSchema),
          404: t.Object({
            message: t.String({ default: "invalid evaluator" }),
          }),
        },
      },
    ),
  );
