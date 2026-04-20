import { t } from "elysia";
import { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { factoryService } from "../../../service/factory";
import { UpdateFactorySchema } from "../../../schema/factory";
import { adminService } from "../../../service/admin";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group
      .use(adminGuard)
      .patch(
        "",
        async ({ params, body }) => {
          return await factoryService.update(params.id, body);
        },
        {
          detail: { description: "update ข้อมูลของ สปก. ตาม id ของสปก." },
          params: t.Object({ id: t.Number() }),
          body: UpdateFactorySchema,
          response: {
            200: t.Object({
              message: t.String({ default: "factory updated successfully" }),
            }),
            404: t.Object({
              message: t.String({ default: "admin not found" }),
            }),
            400: t.Object({
              message: t.String({ default: "invalid subdistrict id" }),
            }),
          },
        },
      )
      .delete(
        "",
        async ({ params, set }) => {
          const result = await adminService.deleteFactory(params.id);
          set.status = 200;
          return result;
        },
        {
          detail: { description: "ลบข้อมูล สปก." },
          params: t.Object({ id: t.Number() }),
          response: {
            200: t.Object({
              message: t.String({ default: "factory delete succesfully" }),
            }),
            404: t.Object({
              message: t.String({ default: "factory not found" }),
            }),
          },
        },
      )
      .get(
        "",
        async ({ params }) => {
          return await factoryService.getFactoryById(params.id);
        },
        {
          detail: { description: "ดึงข้อมูลสปก. ตาม id" },
          params: t.Object({ id: t.Number() }),
          response: {
            200: t.Object({
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
              province_id: t.Number(),
              district_id: t.Number(),
              subdistrict_id: t.Number(),
              is_validate: t.Boolean(),
              username: t.String(),
              province_name_th: t.String(),
              district_name_th: t.String(),
              subdistrict_name_th: t.String(),
            }),
            404: t.Object({
              message: t.String({ default: "factory not found" }),
            }),
          },
        },
      ),
  );
