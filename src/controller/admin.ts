import Elysia, { t } from "elysia";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../service/authentication";
import { UpdateAdminSchema } from "../schema/admin";
import { adminService } from "../service/admin";
import { UpdateFactorySchema } from "../schema/factory";
import { BaseEnrollSelect } from "../schema";
import { enrollService } from "../service/enroll";
import { factoryService } from "../service/factory";

export const adminController = new Elysia({
  prefix: "/admins",
  tags: ["admins"],
})

  .group("", (ac) =>
    ac
      .use(jwtPlugin)
      .use(requireRoles(Role.DOED))
      .patch(
        "",
        async ({ body, jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          return await adminService.editAdminData(id, body);
        },
        {
          detail: { summary: "แก้ไขข้อมูลของ admin" },
          body: UpdateAdminSchema,
          response: {
            200: t.Object({
              message: t.String({ default: "admin updated!" }),
            }),
            400: t.Object({
              message: t.String({ default: "admin not found" }),
            }),
          },
        },
      ),
  )
  .group("/factories", (ac) =>
    ac
      .use(jwtPlugin)
      .use(requireRoles(Role.DOED))
      .patch(
        "/:id",
        async ({ params, body }) => {
          return await factoryService.update(params.id, body);
        },
        {
          detail: { summary: "update ข้อมูลของ สปก. ตาม id ของสปก." },
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
      .patch(
        "/validate/:id",
        async ({ params }) => {
          return await adminService.approveFactoryRegister(params.id);
        },
        {
          detail: { summary: "อนุมัติการลงทะเบียน" },
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
      )
      .delete(
        "/:id",
        async ({ params, set }) => {
          const result = await adminService.deleteFactory(params.id);
          set.status = 200;
          return result;
        },
        {
          detail: { summary: "ลบข้อมูล สปก." },
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
        async ({ query }) => {
          return await factoryService.getAllFactories(query);
        },
        {
          detail: { summary: "ดึงข้อมูล สปก. ทั้งหมด" },
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
      .get(
        "/:id",
        async ({ params }) => {
          return await factoryService.getFactoryById(params.id);
        },
        {
          detail: { summary: "ดึงข้อมูลสปก. ตาม id" },
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
  )
  .group("/enrolls", (ac) =>
    ac
      .use(jwtPlugin)
      .use(requireRoles(Role.DOED))
      .get(
        "",
        async () => {
          return await enrollService.getAllEnrolls();
        },
        {
          detail: { summary: "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมด" },
          response: t.Array(
            t.Composite([
              BaseEnrollSelect,
              t.Object({
                factory_name_th: t.String(),
                region: t.Number(),
                provinceId: t.Number(),
              }),
            ]),
          ),
        },
      )
      .get(
        "/:id",
        async ({ params }) => {
          return await enrollService.getEnrollById(params.id);
        },
        {
          detail: { summary: "ดึงข้อมูลการสมัครเข้าร่วมโครงการตาม id" },
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
