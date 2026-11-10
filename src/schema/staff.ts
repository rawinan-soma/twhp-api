import { type Static, t } from "elysia";
import { BaseAccountSelect, BaseEvaluatorSelect, BaseProvinceSelect } from ".";

const StaffCommon = t.Composite([
  t.Object({ role: t.Union([t.Literal("Evaluator"), t.Literal("Provincial")]) }),
  t.Pick(BaseEvaluatorSelect, ["firstName", "lastName", "phoneNumber"]),
  t.Pick(BaseAccountSelect, ["email"]),
  t.Object({
    level: t.Nullable(BaseEvaluatorSelect.properties.level),
    region: t.Nullable(BaseEvaluatorSelect.properties.region),
    provinceId: t.Nullable(BaseProvinceSelect.properties.provinceId),
    provinceName: t.Nullable(BaseProvinceSelect.properties.nameTh),
  }),
]);

const AcceptedStaffEntry = t.Composite([
  StaffCommon,
  t.Object({ status: t.Literal("accepted"), accountId: t.Number(), username: t.String() }),
]);

const InvitedStaffEntry = t.Composite([
  StaffCommon,
  t.Object({
    status: t.Union([t.Literal("pending"), t.Literal("expired")]),
    invitationId: t.Number(),
  }),
]);

export const StaffList = t.Array(t.Union([InvitedStaffEntry, AcceptedStaffEntry]));

export type StaffEntry = Static<typeof StaffList>[number];
