import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { StaffList } from "../../../schema/staff";
import { staffService } from "../../../service/staff";

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get("", () => staffService.list(), {
      detail: {
        description:
          "รายชื่อผู้ประเมิน เจ้าหน้าที่จังหวัด และคำเชิญที่ยังไม่ถูกตอบรับ พร้อมสถานะ accepted, pending หรือ expired เรียงลำดับคำเชิญก่อนตาม invitationId จากน้อยไปมาก แล้วจึงเป็นบัญชีตาม accountId จากน้อยไปมาก",
      },
      response: { 200: StaffList },
    }),
  );
