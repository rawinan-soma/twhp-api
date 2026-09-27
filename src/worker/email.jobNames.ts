/**
 * Every job name `processEmailJob`'s switch (`src/worker/email.ts`) handles — kept as its own
 * side-effect-free module so `src/worker/metrics.ts` can pre-register `twhp_email_jobs_total`
 * against it without pulling nodemailer/BullMQ/adminService into the metrics module. Pre-registering
 * at 0 means a first-ever failure is a visible 0 -> 1 for Prometheus' `increase()`, instead of the
 * series appearing already at 1 with no prior sample to diff against (ticket 08's clearance
 * finding: a lone forced SMTP failure never fired "Email jobs failing"). Keep in sync with the
 * switch's `case`s.
 */
export const EMAIL_JOB_NAMES = [
  "password-reset-request",
  "factory-validation-reminder",
  "2fa-otp",
  "verdict-result-finished",
  "verdict-result-in-progress",
] as const;
