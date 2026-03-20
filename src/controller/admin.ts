import Elysia, { t } from "elysia";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../usecase/authentication";
import { UpdateAdminSchema } from "../schema/admin";
import { adminUsecase } from "../usecase/admin";
import { UpdateFactorySchema } from "../schema/factory";
import { factoryUsecase } from "../usecase/factory";
import { enrollUsecase } from "../usecase/enroll";
import { BaseEnrollSelect } from "../schema";

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
          return await adminUsecase.editAdminData(id, body);
        },
        {
          body: UpdateAdminSchema,
          response: t.Object({
            message: t.String({ default: "admin updated successfully" }),
          }),
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
          return await factoryUsecase.update(params.id, body);
        },
        {
          params: t.Object({ id: t.Number() }),
          body: UpdateFactorySchema,
          response: t.Object({
            message: t.String({ default: "factory updated successfully" }),
          }),
        },
      )
      .patch(
        "/validate/:id",
        async ({ params }) => {
          return await factoryUsecase.approveFactoryRegister(params.id);
        },
        {
          params: t.Object({ id: t.Number() }),
          response: t.Object({
            message: t.String({ default: "factory successfully validated" }),
          }),
        },
      )
      .delete(
        "/:id",
        async ({ params, set }) => {
          const result = await factoryUsecase.deleteFactory(params.id);
          set.status = 200;
          return result;
        },
        {
          params: t.Object({ id: t.Number() }),
          response: t.Object({
            message: t.String({ default: "factory delete succesfully" }),
          }),
        },
      )
      .get(
        "",
        async ({ query }) => {
          return await factoryUsecase.getAllFactories(query);
        },
        {
          query: t.Object({
            validated: t.Boolean(),
            enrolled: t.Optional(t.Boolean()),
            provinceId: t.Optional(t.Numeric()),
            region: t.Optional(t.Numeric()),
          }),
          response: t.Array(
            t.Object({
              province_name_th: t.Optional(t.String()),
              district_name_th: t.Optional(t.String()),
              subdistrict_name_th: t.Optional(t.String()),
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
          return await factoryUsecase.getFactoryById(params.id);
        },
        {
          params: t.Object({ id: t.Number() }),
          response: t.Object({
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
            username: t.Optional(t.String()),
            province_name_th: t.Optional(t.String()),
            district_name_th: t.Optional(t.String()),
            subdistrict_name_th: t.Optional(t.String()),
          }),
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
          return await enrollUsecase.getAllEnrolls();
        },
        {
          response: t.Array(
            t.Composite([
              BaseEnrollSelect,
              t.Object({
                factory_name_th: t.Nullable(t.String()),
                region: t.Nullable(t.Number()),
                provinceId: t.Nullable(t.Number()),
              }),
            ]),
          ),
        },
      )
      .get(
        "/:id",
        async ({ params }) => {
          return await enrollUsecase.getEnrollById(params.id);
        },
        {
          params: t.Object({ id: t.Number() }),
          response: t.Composite([
            BaseEnrollSelect,
            t.Object({
              province_name_th: t.Optional(t.String()),
              district_name_th: t.Optional(t.String()),
              subdistrict_name_th: t.Optional(t.String()),
            }),
          ]),
        },
      ),
  );
