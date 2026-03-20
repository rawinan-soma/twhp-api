import Elysia, { t } from "elysia";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../usecase/authentication";
import { evaluatorUsecase } from "../usecase/evaluator";
import { factoryUsecase } from "../usecase/factory";
import { enrollUsecase } from "../usecase/enroll";

export const evaluatorController = new Elysia({
  prefix: "/evaluators",
  tags: ["evaluator"],
})
  .group("/factories", (ec) =>
    ec
      .use(jwtPlugin)
      .use(requireRoles(Role.Evaluator))
      .get(
        "",
        async ({ query, jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          const region = (await evaluatorUsecase.helper.getEvaluatorData(id))
            .region;
          return await factoryUsecase.getAllFactories({
            validated: query.validated,
            enrolled: query.enrolled,
            region: region,
          });
        },
        {
          query: t.Object({
            validated: t.Boolean(),
            enrolled: t.Optional(t.Boolean()),
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
  .group("/enrolls", (ec) =>
    ec
      .use(jwtPlugin)
      .use(requireRoles(Role.Evaluator))
      .get("", async ({ jwtPayload }) => {
        const region = (
          await evaluatorUsecase.helper.getEvaluatorData(Number(jwtPayload.sub))
        ).region;
        return await enrollUsecase.getAllEnrollsByRegion(region);
      })
      .get(
        "/:id",
        async ({ params: { id } }) => {
          return await enrollUsecase.getEnrollById(id);
        },
        {
          params: t.Object({ id: t.Number() }),
        },
      ),
  );
