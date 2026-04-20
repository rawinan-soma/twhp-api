import { ElysiaCustomStatusResponse, status, t } from "elysia";
import { App } from "../../..";
import { officerGuard } from "../../../middleware/guards";
import { provincialOfficerService } from "../../../service/provincialOfficer";
import { enrollService } from "../../../service/enroll";
import { BaseEnrollSelect } from "../../../schema";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload }) => {
        const id = Number(jwtPayload.sub);
        const po = await provincialOfficerService.getOfficerDataById(id);
        if (po instanceof ElysiaCustomStatusResponse) return status(404, { message: "provincial officer not found" });
        const result = await enrollService.getAllEnrollsByProvince(po.provinceId);
        return result;
      },
      {
        detail: { description: "ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมดของจังหวัด" },
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
