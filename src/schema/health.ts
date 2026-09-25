import { t } from "elysia";

const CheckStatus = t.Union([t.Literal("up"), t.Literal("down")]);

/** Same shape for 200 and 503. Carries no error messages, hostnames or credentials. */
export const ReadinessSchema = t.Object({
  status: t.Union([t.Literal("ready"), t.Literal("not_ready")]),
  checks: t.Object({
    postgres: CheckStatus,
    redis: CheckStatus,
    minio: CheckStatus,
  }),
});

export type Readiness = typeof ReadinessSchema.static;
