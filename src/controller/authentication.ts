import Elysia, { t } from "elysia";
import { authenticationService, Role } from "../service/authentication";
import { jwtPlugin } from "../middleware/jwt";

const publicAuthenticationController = new Elysia()
  .post(
    "/login",
    async ({ body, cookie: { Authentication, Refresh }, set }) => {
      const { username, password } = body;
      const account = await authenticationService.getAutheticatedAccount(username, password);

      const accessToken = await authenticationService.helper.issueToken(
        account.id,
        account.username,
        account.role as Role,
        "Authentication",
      );

      const refreshToken = await authenticationService.helper.issueToken(
        account.id,
        account.username,
        account.role as Role,
        "Refresh",
      );

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
      response: t.Object({
        message: t.String(),
        user: t.Object({
          id: t.Number(),
          role: t.String(),
          username: t.String(),
        }),
      }),
    },
  )
  .post(
    "/reset-password-request",
    async ({ body: { email }, set }) => {
      await authenticationService.sendPasswordResetEmail(email);
      set.status = 200;
      return { message: "sending password reset email" };
    },
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      response: t.Object({
        message: t.String({ default: "sending password reset email" }),
      }),
    },
  )
  .post(
    "/reset-password",
    async ({ body: { password, token }, set }) => {
      await authenticationService.updatePassword(password, token);
      set.status = 200;
      return { message: "password change!!" };
    },
    {
      body: t.Object({ password: t.String(), token: t.String() }),
      response: t.Object({
        message: t.String({ default: "password change!!" }),
      }),
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
        "/",
        async ({ jwtPayload }) => {
          return await authenticationService.helper.getAccountById(
            Number(jwtPayload.sub),
          );
        },
        {
          response: t.Object({
            id: t.Number(),
            username: t.String(),
            role: t.String(),
            change_pw: t.Boolean(),
          }),
        },
      ),
  );
