import Elysia, { ElysiaCustomStatusResponse, status, t } from "elysia";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { authenticationService, Role } from "../service/authentication";
import { provincialOfficerService } from "../service/provincialOfficer";
import { BaseEnrollSelect } from "../schema";
import { factoryService } from "../service/factory";
import { enrollService } from "../service/enroll";

export const provincialOfficerController = new Elysia({
  prefix: "/provincialOfficers",
  tags: ["provincial Officer"],
})
  .group("", (poc) =>
    poc
      .use(jwtPlugin)
      .use(requireRoles(Role.Provincial))
      .patch(
        "/password",
        async ({ jwtPayload, body: { password, email } }) => {
          const accountId = Number(jwtPayload.sub);
          return await authenticationService.editFirstPassword(accountId, password, email, "Provincial");
        },
        {
          detail: { summary: "เปลี่ยนรหัสผ่านในครั้งแรกที่ login" },
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
  .group("/factories", (poc) =>
    poc
      .use(jwtPlugin)
      .use(requireRoles(Role.Provincial))
      .get(
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
          detail: { summary: "ดึงข้อมูลโรงงานทั้งหมดในจังหวัด" },
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
  )
  .group("/enrolls", (poc) =>
    poc
      .use(jwtPlugin)
      .use(requireRoles(Role.Provincial))
      .get(
        "",
        async ({ jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          const po = await provincialOfficerService.getOfficerDataById(id);
          if (po instanceof ElysiaCustomStatusResponse) return status(404, { message: "provincial officer not found" });
          const result = await enrollService.getAllEnrollsByProvince(po.provinceId);
          return result;
        },
        {
          detail: { summary: "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมดของจังหวัด" },
          response: {
            404: t.Object({ message: t.String({ default: "officer not found" }) }),
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
          },
        },
      ),
  );
