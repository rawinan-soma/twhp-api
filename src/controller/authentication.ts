import Elysia, { ElysiaCustomStatusResponse, t } from "elysia";
import { authenticationService, Role } from "../service/authentication";
import { jwtPlugin } from "../middleware/jwt";

const publicAuthenticationController = new Elysia()
  .post(
    "/login",
    async ({ body, cookie: { Authentication, Refresh }, set }) => {
      const { username, password } = body;
      const account = await authenticationService.getAutheticatedAccount(username, password);

      if (account instanceof ElysiaCustomStatusResponse) {
        return account;
      }

      const accessToken = await authenticationService.helper.issueToken(
        account.id,
        account.username,
        account.role as Role,
        "Authentication",
      );

      if (accessToken instanceof ElysiaCustomStatusResponse) {
        return accessToken;
      }

      const refreshToken = await authenticationService.helper.issueToken(
        account.id,
        account.username,
        account.role as Role,
        "Refresh",
      );

      if (refreshToken instanceof ElysiaCustomStatusResponse) {
        return refreshToken;
      }

      const hashedRefreshToken = Bun.SHA256.hash(refreshToken, "hex");

      await authenticationService.helper.setRefreshToken(hashedRefreshToken, account.id);

      Authentication.set({
        value: accessToken,
        ...authenticationService.helper.getCookieOption("Authentication"),
      });

      Refresh.set({
        value: refreshToken,
        ...authenticationService.helper.getCookieOption("Refresh"),
      });

      set.status = 200;
      return {
        message: "login successful",
        user: {
          id: account.id,
          role: account.role,
          username: account.username,
        },
      };
    },
    {
      body: t.Object({ username: t.String(), password: t.String() }),
      cookie: t.Cookie({
        Authentication: t.Optional(t.String()),
        Refresh: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          message: t.String(),
          user: t.Object({
            id: t.Number(),
            role: t.String(),
            username: t.String(),
          }),
        }),
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
        500: t.Object({ message: t.String({ default: "cannot issue token" }) }),
      },
    },
  )
  .post(
    "/reset-password-request",
    async ({ body: { email }, set }) => {
      return await authenticationService.sendPasswordResetEmail(email);
    },
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      response: {
        201: t.Object({
          message: t.String({ default: "sending password reset email" }),
        }),
        404: t.Object({ message: t.String({ default: "email not found" }) }),
        429: t.Object({ message: t.String({ default: "password reset email already sent, please wait before requesting again" }) }),
      },
    },
  )
  .post(
    "/reset-password",
    async ({ body: { password, token }, set }) => {
      return await authenticationService.updatePassword(password, token);
    },
    {
      body: t.Object({ password: t.String(), token: t.String() }),
      response: {
        200: t.Object({
          message: t.String({ default: "password changed!" }),
        }),
        400: t.Union([
          t.Object({ message: t.String({ default: "invalid token" }) }),
          t.Object({
            message: t.String({ default: "old password are not allowed", description: "password ซ้ำกับของเดิม" }),
          }),
        ]),
      },
    },
  );

export const authenticationController = new Elysia({
  prefix: "/authentication",
  tags: ["authen"],
})
  .group("", (auth) => auth.use(publicAuthenticationController))
  .group("", (auth) =>
    auth
      .use(jwtPlugin)
      .post(
        "/logout",
        async ({ cookie: { Authentication, Refresh }, jwtPayload, set }) => {
          Authentication.set({
            value: "",
            ...authenticationService.helper.getCookieOption("logout"),
          });

          Refresh.set({
            value: "",
            ...authenticationService.helper.getCookieOption("logout"),
          });

          await authenticationService.helper.removeRefreshToken(Number(jwtPayload.sub));

          set.status = 200;
          return { message: "logout successful" };
        },
        {
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
            }),
            400: t.Object({
              message: t.String({ default: "invalid credential" }),
            }),
          },
          detail: { summary: "ดึงข้อมูล user ของ session ปัจจุบัน" },
        },
      ),
  );
