import Elysia, { t } from "elysia";
import { locationService } from "../service/location";

export const locationController = new Elysia({
  prefix: "/location",
  tags: ["location"],
})
  .get(
    "/provinces",
    async () => {
      return await locationService.getAllProvinces();
    },
    {
      detail: { summary: "ดึงข้อมูลจังหวัด" },
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
      return await locationService.getAllDistrictByProvinceId(params.provinceId);
    },
    {
      detail: { summary: "ดึงข้อมูลอำเภอ" },
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
      return await locationService.getAllSubdistrictByDistrictId(districtId);
    },
    {
      detail: { summary: "ดึงข้อมูลตำบล" },
      params: t.Object({ districtId: t.Numeric() }),
      response: t.Array(
        t.Object({
          name_th: t.String(),
          subdistrict_id: t.Number(),
        }),
      ),
    },
  );
