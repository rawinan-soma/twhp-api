import { t } from "elysia";
import { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { factoryService } from "../../../service/factory";
import { adminService } from "../../../service/admin";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group
      .use(adminGuard)
      .get(
        "",
        async ({ query }) => {
          return await factoryService.getAllFactories(query);
        },
        {
          detail: { description: "ดึงข้อมูล สปก. ทั้งหมด" },
          query: t.Object({
            validated: t.Boolean(),
            enrolled: t.Optional(t.Boolean()),
          }),
          response: t.Array(
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
        },
      )
      .patch(
        "/validate/:id",
        async ({ params }) => {
          return await adminService.approveFactoryRegister(params.id);
        },
        {
          detail: { description: "อนุมัติการลงทะเบียน" },
          params: t.Object({ id: t.Number() }),
          response: {
            200: t.Object({
              message: t.String({ default: "factory validated!" }),
            }),
            404: t.Object({
              message: t.String({ default: "factory not found" }),
            }),
            400: t.Object({
              message: t.String({ default: "factory already validated" }),
            }),
          },
        },
      ),
  );
