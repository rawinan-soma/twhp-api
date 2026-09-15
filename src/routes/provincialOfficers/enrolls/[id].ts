import { ElysiaCustomStatusResponse, status, t } from "elysia";
import type { App } from "../../..";
import { officerGuard } from "../../../middleware/guards";
import { BaseEnrollSelect } from "../../../schema";
import { enrollService } from "../../../service/enroll";
import { provincialOfficerService } from "../../../service/provincialOfficer";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload, params: { id } }) => {
        const officerId = Number(jwtPayload.sub);
        const officer = await provincialOfficerService.getOfficerDataById(officerId);
        if (officer instanceof ElysiaCustomStatusResponse) {
          return status(404, { message: "enroll not found" });
        }
        return await enrollService.getEnrollById(id, officer.provinceId);
      },
      {
        detail: {
          description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการตาม id (เฉพาะในจังหวัดของเจ้าหน้าที่)",
        },
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
