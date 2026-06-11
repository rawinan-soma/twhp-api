import Elysia, { ElysiaCustomStatusResponse, t } from "elysia";
import type { App } from "../..";
import { jwtPlugin } from "../../middleware/jwt";
import { authenticationService, type Role } from "../../service/authentication";
import {
  LoginResponseDto,
  LoginSuccessResponse,
  ResendOtpBody,
  VerifyOtpBody,
} from "../../schema/authentication";

const publicAuthenticationController = new Elysia()
  .post(
    "/login",
    async ({ body, cookie: { Authentication, Refresh }, set }) => {
      const { username, password } = body;
      const account = await authenticationService.getAutheticatedAccount(username, password);

      if (account instanceof ElysiaCustomStatusResponse) {
        return account;
      }

      if (!authenticationService.requiresOtp(account.role, account.isChangePassword)) {
        const accessToken = await authenticationService.helper.issueToken(
          account.id,
          account.username,
          account.role as Role,
          "Authentication",
        );
        if (accessToken instanceof ElysiaCustomStatusResponse) return accessToken;

        const refreshToken = await authenticationService.helper.issueToken(
          account.id,
          account.username,
          account.role as Role,
          "Refresh",
        );
        if (refreshToken instanceof ElysiaCustomStatusResponse) return refreshToken;

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
            full_name: account.full_name,
          },
        };
      }

      const challenge = await authenticationService.createChallenge(account.id, account.email);
      if (challenge instanceof ElysiaCustomStatusResponse) {
        return challenge;
      }

      set.status = 200;
      return {
        twoFactorRequired: true as const,
        challengeId: challenge.challengeId,
        email: authenticationService.maskEmail(account.email),
      };
    },
    {
      detail: { description: "Staff/Factory login (step 1)" },
      body: t.Object({ username: t.String(), password: t.String() }),
      cookie: t.Cookie({
        Authentication: t.Optional(t.String()),
        Refresh: t.Optional(t.String()),
      }),
      response: {
        200: LoginResponseDto,
        401: t.Union([
          t.Object({ message: t.String({ default: "invalid username or password" }) }),
          t.Object({ message: t.String({ default: "factory not validate" }) }),
          t.Object({ message: t.String({ default: "too many attempts, please restart login" }) }),
        ]),
        429: t.Object({
          message: t.String({ default: "too many failed attempts, please try again later" }),
        }),
        500: t.Object({ message: t.String({ default: "cannot issue token" }) }),
      },
    },
  )
  .post(
    "/login/verify-otp",
    async ({ body: { challengeId, code }, cookie: { Authentication, Refresh }, set }) => {
      const result = await authenticationService.verifyChallenge(challengeId, code);

      if (result instanceof ElysiaCustomStatusResponse) {
        return result;
      }

      const accessToken = await authenticationService.helper.issueToken(
        result.id,
        result.username,
        result.role as Role,
        "Authentication",
      );
      if (accessToken instanceof ElysiaCustomStatusResponse) return accessToken;

      const refreshToken = await authenticationService.helper.issueToken(
        result.id,
        result.username,
        result.role as Role,
        "Refresh",
      );
      if (refreshToken instanceof ElysiaCustomStatusResponse) return refreshToken;

      const hashedRefreshToken = Bun.SHA256.hash(refreshToken, "hex");
      await authenticationService.helper.setRefreshToken(hashedRefreshToken, result.id);

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
          id: result.id,
          role: result.role,
          username: result.username,
          full_name: result.full_name,
        },
      };
    },
    {
      detail: { description: "Submit OTP to complete staff login (step 2)" },
      body: VerifyOtpBody,
      cookie: t.Cookie({
        Authentication: t.Optional(t.String()),
        Refresh: t.Optional(t.String()),
      }),
      response: {
        200: LoginSuccessResponse,
        400: t.Object({ message: t.String({ default: "invalid or expired challenge" }) }),
        401: t.Union([
          t.Object({
            message: t.String({ default: "incorrect code" }),
            attemptsRemaining: t.Number(),
          }),
          t.Object({ message: t.String({ default: "too many attempts, please restart login" }) }),
        ]),
        429: t.Object({
          message: t.String({ default: "too many failed attempts, please try again later" }),
        }),
        500: t.Object({ message: t.String({ default: "cannot issue token" }) }),
      },
    },
  )
  .post(
    "/login/resend-otp",
    async ({ body: { challengeId } }) => {
      const result = await authenticationService.resendOtp(challengeId);
      if (result instanceof ElysiaCustomStatusResponse) return result;
      return { message: "OTP re-sent" };
    },
    {
      detail: { description: "Request OTP resend (60s throttle)" },
      body: ResendOtpBody,
      response: {
        200: t.Object({ message: t.String({ default: "OTP re-sent" }) }),
        400: t.Object({ message: t.String({ default: "invalid or expired challenge" }) }),
        429: t.Union([
          t.Object({
            message: t.String({ default: "please wait before requesting another code" }),
          }),
          t.Object({
            message: t.String({ default: "too many failed attempts, please try again later" }),
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
    .group("", { detail: { tags: ["authentication"] } }, (group) =>
      group.use(publicAuthenticationController),
    )
    .group("", { detail: { tags: ["authentication"] } }, (group) =>
      group
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
            detail: { description: "logout" },
            response: t.Object({
              message: t.String({ default: "logout successful" }),
            }),
          },
        )
        .get(
          "",
          async ({ jwtPayload }) => {
            const result = await authenticationService.helper.getAccountById(
              Number(jwtPayload.sub),
            );
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
