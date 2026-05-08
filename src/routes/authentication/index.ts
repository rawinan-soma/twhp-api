import Elysia, { ElysiaCustomStatusResponse, t } from "elysia";
import { App } from "../..";
import { authenticationService } from "../../service/authentication";
import { jwtPlugin } from "../../middleware/jwt";
import { auth } from "../../auth";

type SignInUsernameAPI = (opts: {
  body: { username: string; password: string };
  asResponse: true;
}) => Promise<Response>;

const signInUsername = auth.api.signInUsername as unknown as SignInUsernameAPI;

const publicAuthenticationController = new Elysia()
  .post(
    "/login",
    async ({ body, set }) => {
      const res = await signInUsername({
        body: { username: body.username, password: body.password },
        asResponse: true,
      });

      if (!res.ok) {
        set.status = res.status;
        return (await res.json()) as { message: string };
      }

      const data = (await res.json()) as { user: { id: number } };
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) set.headers["Set-Cookie"] = setCookie;

      const userData = await authenticationService.helper.getAccountById(data.user.id);
      if (userData instanceof ElysiaCustomStatusResponse) return userData;

      set.status = 200;
      return {
        message: "login successful",
        user: {
          id: userData.id,
          role: userData.role,
          username: userData.username,
          full_name: userData.full_name,
        },
      };
    },
    {
      detail: { description: "Login" },
      body: t.Object({ username: t.String(), password: t.String() }),
      response: {
        200: t.Object({
          message: t.String(),
          user: t.Object({
            id: t.Number(),
            role: t.String(),
            username: t.String(),
            full_name: t.String(),
          }),
        }),
        400: t.Object({ message: t.String({ default: "invalid credential" }) }),
        401: t.Union([
          t.Object({
            message: t.String({
              default: "invalid username or password",
              description: "invalid credential",
            }),
          }),
          t.Object({
            message: t.String({
              default: "factory not validate",
              description: "factory is not validate",
            }),
          }),
        ]),
      },
    },
  )
  .post(
    "/reset-password-request",
    async ({ body: { email } }) => {
      return await authenticationService.sendPasswordResetEmail(email);
    },
    {
      detail: { description: "ขอ email เพื่อ reset password" },
      body: t.Object({ email: t.String({ format: "email" }) }),
      response: {
        201: t.Object({
          message: t.String({ default: "sending password reset email" }),
        }),
        404: t.Object({ message: t.String({ default: "email not found" }) }),
        429: t.Object({
          message: t.String({
            default: "password reset email already sent, please wait before requesting again",
          }),
        }),
      },
    },
  )
  .post(
    "/reset-password",
    async ({ body: { password, token } }) => {
      return await authenticationService.updatePassword(password, token);
    },
    {
      detail: { description: "reset password" },
      body: t.Object({ password: t.String(), token: t.String() }),
      response: {
        200: t.Object({
          message: t.String({ default: "password changed!" }),
        }),
        400: t.Union([
          t.Object({ message: t.String({ default: "invalid token" }) }),
          t.Object({
            message: t.String({
              default: "old password are not allowed",
              description: "password ซ้ำกับของเดิม",
            }),
          }),
        ]),
      },
    },
  );

export default (app: App) =>
  app
    .group("", { detail: { tags: ["authentication"] } }, (group) => group.use(publicAuthenticationController))
    .group("", { detail: { tags: ["authentication"] } }, (group) =>
      group
        .use(jwtPlugin)
        .post(
          "/logout",
          async ({ request, set }) => {
            const res = await auth.api.signOut({
              headers: request.headers,
              asResponse: true,
            });
            const setCookie = res.headers.get("set-cookie");
            if (setCookie) set.headers["Set-Cookie"] = setCookie;
            set.status = 200;
            return { message: "logout successful" };
          },
          {
            detail: { description: "logout" },
            response: t.Object({
              message: t.String({ default: "logout successful" }),
            }),
          },
        )
        .get(
          "",
          async ({ jwtPayload }) => {
            const result = await authenticationService.helper.getAccountById(Number(jwtPayload.sub));
            return result;
          },
          {
            response: {
              200: t.Object({
                id: t.Number(),
                username: t.String(),
                role: t.String(),
                change_pw: t.Boolean(),
                eval_level: t.Nullable(t.String()),
                full_name: t.String(),
              }),
              400: t.Object({
                message: t.String({ default: "invalid credential" }),
              }),
            },
            detail: { description: "ดึงข้อมูล user ของ session ปัจจุบัน" },
          },
        ),
    );
