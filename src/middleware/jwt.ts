import { jwt } from "@elysiajs/jwt";
import { Elysia, ElysiaCustomStatusResponse, type Static, status, t } from "elysia";
import { env } from "../config";
import { authenticationService } from "../service/authentication";

const jwtPayloadDto = t.Object({
  sub: t.String(),
  iat: t.Number(),
  exp: t.Number(),
  username: t.String(),
  role: t.String(),
});

type jwtType = Static<typeof jwtPayloadDto>;

export const jwtPlugin = new Elysia({ name: "jwt-middleware" })
  .use(
    jwt({
      name: "jwt",
      secret: env.AUTH_JWT_SECRET,
      alg: "HS256",
      schema: t.Object({
        sub: t.String(),
        iat: t.Number(),
        exp: t.Number(),
        username: t.String(),
        role: t.String(),
      }),
    }),
  )
  .derive({ as: "global" }, async ({ jwt, cookie: { Authentication, Refresh } }) => {
    const accessToken = Authentication?.value;
    const refreshToken = Refresh?.value;

    if (accessToken) {
      const payload = (await jwt.verify(accessToken as string)) as jwtType;
      if (payload) {
        return { jwtPayload: payload };
      }
    }

    if (refreshToken) {
      try {
        const token = await authenticationService.rotateToken(refreshToken as string);

        if (token instanceof ElysiaCustomStatusResponse) {
          return status(401, { message: "session expired" });
        }

        const { newAccessToken, newRefreshToken } = token;

        const accessOpts = authenticationService.helper.getCookieOption("Authentication");
        const refreshOpts = authenticationService.helper.getCookieOption("Refresh");

        Authentication.set({ value: newAccessToken, ...accessOpts });
        Refresh.set({ value: newRefreshToken, ...refreshOpts });

        const payload = (await jwt.verify(newAccessToken)) as jwtType;
        if (payload) {
          return { jwtPayload: payload };
        }
      } catch {
        const logoutOpts = authenticationService.helper.getCookieOption("logout");
        Authentication.set({ value: "", ...logoutOpts });
        Refresh.set({ value: "", ...logoutOpts });

        return status(401, { message: "session expired" });
      }
    }

    return status(401, { message: "unauthorized" });
  });
