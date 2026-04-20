import { t } from "elysia";
import { App } from "../..";
import { locationService } from "../../service/location";

export default (app: App) =>
  app.group("", { detail: { tags: ["location"] } }, (group) =>
    group
      .get(
        "/provinces",
        async () => {
          return await locationService.getAllProvinces();
        },
        {
          detail: { description: "ดึงข้อมูลจังหวัด" },
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
          detail: { description: "ดึงข้อมูลอำเภอ" },
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
          detail: { description: "ดึงข้อมูลตำบล" },
          params: t.Object({ districtId: t.Numeric() }),
          response: t.Array(
            t.Object({
              name_th: t.String(),
              subdistrict_id: t.Number(),
            }),
          ),
        },
      ),
  );
