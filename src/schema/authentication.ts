import { t } from "elysia";
import {
  BaseAccountSelect,
  BaseAdminsDoedSelect,
  BaseEvaluatorSelect,
  BaseFactorySelect,
  BaseProvincialOfficerSelect,
} from ".";

export const GetMeResponse = t.Composite([
  t.Omit(BaseAccountSelect, ["password", "hashedRefreshToken"]),
  t.Object({
    adminDoed: t.Nullable(BaseAdminsDoedSelect),
    evaluator: t.Nullable(BaseEvaluatorSelect),
    factory: t.Nullable(BaseFactorySelect),
    provincial: t.Nullable(BaseProvincialOfficerSelect),
  }),
]);

export const LoginSuccessResponse = t.Object({
  message: t.String(),
  user: t.Object({
    id: t.Number(),
    role: t.String(),
    username: t.String(),
    full_name: t.String(),
  }),
});

export const TwoFactorRequiredResponse = t.Object(
  {
    twoFactorRequired: t.Literal(true),
    challengeId: t.String({ description: "Opaque challenge identifier" }),
    email: t.String({ description: "Masked email address (e.g. r****@gmail.com)" }),
  },
  { description: "2FA challenge created — submit OTP to /login/verify-otp" },
);

export const LoginResponseDto = t.Union([LoginSuccessResponse, TwoFactorRequiredResponse], {
  description: "Login response — check twoFactorRequired to determine path",
});

export const VerifyOtpBody = t.Object({
  challengeId: t.String({ minLength: 1, description: "challengeId from /login step-1" }),
  code: t.String({ pattern: "^[0-9]{6}$", description: "6-digit OTP code from email" }),
});

export const ResendOtpBody = t.Object({
  challengeId: t.String({ minLength: 1, description: "challengeId from /login step-1" }),
});
