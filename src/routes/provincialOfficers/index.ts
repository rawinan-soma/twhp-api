import { t } from "elysia";
import type { App } from "../..";
import { officerGuard } from "../../middleware/guards";
import { authenticationService } from "../../service/authentication";

export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).patch(
      "/password",
      async ({ jwtPayload, body: { password, email } }) => {
        const accountId = Number(jwtPayload.sub);
        return await authenticationService.editFirstPassword(
          accountId,
          password,
          email,
          "Provincial",
        );
      },
      {
        detail: { description: "เปลี่ยนรหัสผ่านในครั้งแรกที่ login" },
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
  );
