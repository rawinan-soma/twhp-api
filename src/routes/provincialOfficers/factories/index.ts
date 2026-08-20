import { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../../..";
import { officerGuard } from "../../../middleware/guards";
import { ProvincialFactoryListItemSchema } from "../../../schema/factory";
import { Paginated, PaginationQuery } from "../../../schema/pagination";
import { factoryService } from "../../../service/factory";
import { provincialOfficerService } from "../../../service/provincialOfficer";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload, query }) => {
        const id = Number(jwtPayload.sub);
        const { validated, enrolled, page, limit } = query;
        const officer = await provincialOfficerService.getOfficerDataById(id);
        if (officer instanceof ElysiaCustomStatusResponse) {
          return officer;
        }
        const factories = await factoryService.getAllFactoriesByProvinceId({
          validated,
          enrolled: enrolled ?? true,
          page,
          limit,
          provinceId: officer.provinceId,
        });
        return factories;
      },
      {
        detail: {
          description: "ดึงข้อมูลโรงงานทั้งหมดในจังหวัด (แบ่งหน้าด้วย ?page= และ ?limit=)",
        },
        query: t.Composite([
          t.Object({ validated: t.Boolean(), enrolled: t.Optional(t.Boolean()) }),
          PaginationQuery,
        ]),
        response: {
          200: Paginated(ProvincialFactoryListItemSchema),
          404: t.Object({ message: t.String() }),
        },
      },
    ),
  );
