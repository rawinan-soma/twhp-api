import { t } from "elysia";
import { App } from "../..";
import { evalGuard } from "../../middleware/guards";
import { authenticationService } from "../../service/authentication";

export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).patch(
      "/password",
      async ({ jwtPayload, body: { password, email } }) => {
        const accountId = Number(jwtPayload.sub);
        return await authenticationService.editFirstPassword(
          accountId,
          password,
          email,
          "Evaluator",
        );
      },
      {
        detail: { description: "แก้ password ครั้งแรกที่ login" },
        body: t.Object({
          password: t.String(),
          email: t.String({ format: "email" }),
        }),
        response: {
          200: t.Object({ message: t.String({ default: "password change" }) }),
          400: t.Union([
            t.Object({
              message: t.String({ default: "password already change" }),
            }),
            t.Object({
              message: t.String({ default: "email already exists" }),
            }),
          ]),
          404: t.Object({ message: t.String({ default: "user not found" }) }),
        },
      },
    ),
  );
