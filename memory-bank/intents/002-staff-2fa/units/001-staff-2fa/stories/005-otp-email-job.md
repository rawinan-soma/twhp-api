---
id: 005-otp-email-job
unit: 001-staff-2fa
intent: 002-staff-2fa
status: complete
priority: must
created: 2026-06-09T00:00:00.000Z
assigned_bolt: 003-staff-2fa
implemented: true
---

# Story: 005-otp-email-job

## User Story

**As a** staff user logging in
**I want** my OTP delivered promptly by email
**So that** I can complete the second step of login

## Acceptance Criteria

- [ ] **Given** a staff step-1 login, **When** the challenge is created, **Then** a `2fa-otp` job `{ email, code }` is enqueued on the existing `email` queue at higher priority than bulk jobs
- [ ] **Given** a `2fa-otp` job, **When** the worker processes it, **Then** it sends a Thai-language email containing the 6-digit code via the existing nodemailer transporter
- [ ] **Given** a transient SMTP failure, **When** sending, **Then** the job retries per the existing policy (`attempts: 3, backoff: 5000`) and throws on failure so BullMQ retries
- [ ] **Given** the email is enqueued, **When** step-1 responds, **Then** the response does not block on SMTP (delivery is async, off the request path)

## Technical Notes

- `emailQueue.add("2fa-otp", { email, code }, { priority: 1, attempts: 3, backoff: 5000, removeOnComplete: true, removeOnFail: { count: 10 } })` — lower `priority` number = higher priority in BullMQ
- Add a `case "2fa-otp":` to the worker `switch` in `src/worker/email.ts` → `sendOtpEmail(job.data)`
- Model `sendOtpEmail` on `sendPasswordResetEmail`: same `from`, Thai subject/body, 5-min expiry note, contact footer
- The plaintext `code` travels only in the job payload (Redis-backed queue) and the email body — never stored in the challenge or logged

## Dependencies

### Requires

- 002-otp-generation-policy (provides the plaintext code)

### Enables

- 006-login-two-step (login enqueues this job)
- 008-resend-otp-endpoint (resend re-enqueues this job)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Worker process down | Job queued, sent when worker resumes; **login-critical** — monitor (ADR 0002) |
| SMTP hard failure after retries | Job lands in failed set; user can use resend |
| Code present in worker logs | Disallowed — do not log the code body |

## Out of Scope

- HTML template polish/branding beyond mirroring the reset email
- Localization beyond Thai (matches existing emails)
