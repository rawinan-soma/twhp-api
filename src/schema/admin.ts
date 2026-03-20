import { BaseAdminsDoedUpdate } from ".";
import { Static, t } from "elysia";

export const UpdateAdminSchema = t.Composite([
  BaseAdminsDoedUpdate,
  t.Object({
    email: t.Optional(t.String({ format: "email" })),
    password: t.Optional(t.String({ minLength: 12 })),
  }),
]);

export type UpdateAdminDto = Static<typeof UpdateAdminSchema>;
