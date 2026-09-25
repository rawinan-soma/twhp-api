import { t } from "elysia";

export const CheckStatusSchema = t.Union([t.Literal("up"), t.Literal("down")]);
export type CheckStatus = typeof CheckStatusSchema.static;

export const ReadinessChecksSchema = t.Object({
  postgres: CheckStatusSchema,
  redis: CheckStatusSchema,
  minio: CheckStatusSchema,
});
export type ReadinessChecks = typeof ReadinessChecksSchema.static;

/** Same shape for 200 and 503. Carries no error messages, hostnames or credentials. */
export const ReadinessSchema = t.Object({
  status: t.Union([t.Literal("ready"), t.Literal("not_ready")]),
  checks: ReadinessChecksSchema,
});
