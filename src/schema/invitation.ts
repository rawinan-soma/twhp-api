import { type Static, t } from "elysia";
import { BaseEvaluatorInsert, BaseProvincialOfficerInsert } from ".";

// Elysia strips undeclared keys before validating, so `additionalProperties: false` cannot refuse
// another role's field. Declaring the field as absent can.
const absent = t.Optional(t.Never());

const EvaluatorInvitationBody = t.Object(
  {
    role: t.Literal("Evaluator"),
    email: t.String({ format: "email" }),
    ...t.Pick(BaseEvaluatorInsert, ["firstName", "lastName", "phoneNumber", "level", "region"])
      .properties,
    provinceId: absent,
  },
  { additionalProperties: false },
);

const ProvincialInvitationBody = t.Object(
  {
    role: t.Literal("Provincial"),
    email: t.String({ format: "email" }),
    ...t.Pick(BaseProvincialOfficerInsert, ["firstName", "lastName", "phoneNumber", "provinceId"])
      .properties,
    level: absent,
    region: absent,
  },
  { additionalProperties: false },
);

export const CreateInvitationBody = t.Union([EvaluatorInvitationBody, ProvincialInvitationBody]);

export type CreateInvitationDto = Static<typeof CreateInvitationBody>;

export const AcceptInvitationBody = t.Object({ token: t.String(), password: t.String() });

export const InvitationIdParams = t.Object({
  id: t.Integer({ minimum: 1, maximum: 2_147_483_647 }),
});

export const CorrectInvitationEmailBody = t.Object(
  { email: t.String({ format: "email" }) },
  { additionalProperties: false },
);
