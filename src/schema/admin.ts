import { type Static, t } from "elysia";
import { BaseAdminsDoedUpdate } from ".";

export const UpdateAdminSchema = t.Composite([
  BaseAdminsDoedUpdate,
  t.Object({
    email: t.Optional(t.String({ format: "email" })),
    password: t.Optional(t.String({ minLength: 12 })),
  }),
]);

export type UpdateAdminDto = Static<typeof UpdateAdminSchema>;
