import Elysia, { status, t } from "elysia";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { authenticationService, Role } from "../service/authentication";
import { evaluatorService } from "../service/evaluator";

import { enrollService } from "../service/enroll";
import { factoryService } from "../service/factory";
import { BaseEnrollSelect } from "../schema";

export const evaluatorController = new Elysia({
  prefix: "/evaluators",
  tags: ["evaluator"],
})
  .group("", (ec) =>
    ec
      .use(jwtPlugin)
      .use(requireRoles(Role.Evaluator))
      .patch(
        "/password",
        async ({ jwtPayload, body: { password, email } }) => {
          const accountId = Number(jwtPayload.sub);
          return await authenticationService.editFirstPassword(accountId, password, email, "Evaluator");
        },
        {
          body: t.Object({ password: t.String(), email: t.String({ format: "email" }) }),
          response: {
            200: t.Object({ message: t.String({ default: "password change" }) }),
            400: t.Union([
              t.Object({ message: t.String({ default: "password already change" }) }),
              t.Object({ message: t.String({ default: "email already exists" }) }),
            ]),
            404: t.Object({ message: t.String({ default: "user not found" }) }),
          },
        },
      ),
  )
  .group("/factories", (ec) =>
    ec
      .use(jwtPlugin)
      .use(requireRoles(Role.Evaluator))
      .get(
        "",
        async ({ query, jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          const region = await evaluatorService.helper.getEvaluatorData(id);

          if (!region || region.evaluator === null) {
            return status(404, { message: "invalid evaluator" });
          }

          return await factoryService.getAllFactoriesByRegion({
            validated: query.validated,
            enrolled: query.enrolled,
            region: region.evaluator.region,
          });
        },
        {
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
      )
      .get(
        "/:id",
        async ({ params }) => {
          return await factoryService.getFactoryById(params.id);
        },
        {
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
  .group("/enrolls", (ec) =>
    ec
      .use(jwtPlugin)
      .use(requireRoles(Role.Evaluator))
      .get(
        "",
        async ({ jwtPayload }) => {
          const region = await evaluatorService.helper.getEvaluatorData(Number(jwtPayload.sub));

          if (!region || region.evaluator === null) {
            return status(404, { message: "invalid evaluator" });
          }
          return await enrollService.getAllEnrolls(region.evaluator.region);
        },
        {
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
      )
      .get(
        "/:id",
        async ({ params: { id } }) => {
          return await enrollService.getEnrollById(id);
        },
        {
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
