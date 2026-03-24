import Elysia, { t } from "elysia";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { authenticationService, Role } from "../service/authentication";

export const provincialOfficerController = new Elysia({
  prefix: "/provincialOfficers",
  tags: ["provincial Officer"],
}).group("", (poc) =>
  poc
    .use(jwtPlugin)
    .use(requireRoles(Role.Provincial))
    .patch(
      "/password",
      async ({ jwtPayload, body: { password } }) => {
        const accountId = Number(jwtPayload.sub);
        return await authenticationService.editFirstPassword(accountId, password, "Provincial");
      },
      {
        body: t.Object({ password: t.String() }),
        response: {
          200: t.Object({ message: t.String({ default: "password change" }) }),
          400: t.Object({ message: t.String({ default: "password already change" }) }),
          404: t.Object({ message: t.String({ default: "user not found" }) }),
        },
      },
    ),
);
