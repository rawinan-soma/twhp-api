import { ElysiaCustomStatusResponse, t } from "elysia";
import { App } from "../../..";
import { officerGuard } from "../../../middleware/guards";
import { provincialOfficerService } from "../../../service/provincialOfficer";
import { factoryService } from "../../../service/factory";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload, query }) => {
        const id = Number(jwtPayload.sub);
        const { validated, enrolled } = query;
        const officer = await provincialOfficerService.getOfficerDataById(id);
        if (officer instanceof ElysiaCustomStatusResponse) {
          return officer;
        }
        const factories = await factoryService.getAllFactoriesByProvinceId({
          validated,
          enrolled: enrolled ?? true,
          provinceId: officer.provinceId,
        });
        return factories;
      },
      {
        detail: { description: "ดึงข้อมูลโรงงานทั้งหมดในจังหวัด" },
        query: t.Object({ validated: t.Boolean(), enrolled: t.Optional(t.Boolean()) }),
        response: {
          200: t.Array(
            t.Object({
              province_name_th: t.String(),
              district_name_th: t.String(),
              subdistrict_name_th: t.String(),
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
          404: t.Object({ message: t.String() }),
        },
      },
    ),
  );
