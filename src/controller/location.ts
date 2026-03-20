import Elysia, { t } from "elysia";
import { locationUsecase } from "../usecase/location";

export const locationController = new Elysia({
  prefix: "/location",
  tags: ["location"],
})
  .get(
    "/provinces",
    async () => {
      return await locationUsecase.getAllProvinces();
    },
    {
      response: t.Array(
        t.Object({
          name_th: t.String(),
          province_id: t.Number(),
        }),
      ),
    },
  )
  .get(
    "/provinces/:provinceId/districts",
    async ({ params }) => {
      return await locationUsecase.getAllDistrictByProvinceId(
        params.provinceId,
      );
    },
    {
      params: t.Object({ provinceId: t.Numeric() }),
      response: t.Array(
        t.Object({
          name_th: t.String(),
          district_id: t.Number(),
        }),
      ),
    },
  )
  .get(
    "/districts/:districtId/subdistricts",
    async ({ params: { districtId } }) => {
      return await locationUsecase.getAllSubdistrictByDistrictId(districtId);
    },
    {
      params: t.Object({ districtId: t.Numeric() }),
      response: t.Array(
        t.Object({
          name_th: t.String(),
          subdistrict_id: t.Number(),
        }),
      ),
    },
  );
