import { type Static, t } from "elysia";
import { BaseEvaluatorInsert } from ".";

const EvaluatorInvitationBody = t.Composite(
  [
    t.Object({ role: t.Literal("Evaluator"), email: t.String({ format: "email" }) }),
    t.Pick(BaseEvaluatorInsert, ["firstName", "lastName", "phoneNumber", "level", "region"]),
  ],
  { additionalProperties: false },
);

export const CreateInvitationBody = t.Union([EvaluatorInvitationBody]);

export type CreateInvitationDto = Static<typeof CreateInvitationBody>;

export const AcceptInvitationBody = t.Object({ token: t.String(), password: t.String() });
