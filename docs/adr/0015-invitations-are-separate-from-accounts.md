# ADR 0015: Invitations are separate from accounts

**Status:** Accepted (2026-11-09)

**Builds on:** [ADR-0002](0002-email-otp-2fa-for-staff.md). The first-login OTP exemption it records still applies to seeded accounts and does not apply to invited ones.

## Context

Evaluator and Provincial Officer accounts exist only because the seed created them. DOED needs to add reviewers without a developer. An Admin invites a person by email, and the person sets their own password.

A pending person must not be able to log in, and a Factory's enrollment must not record them. The seed-era first-login flow, where an account logs in without OTP and then supplies its real email and password, must keep working for existing accounts.

## Decision

An Invitation is its own row in the `Invitations` table. No `Accounts`, `Evaluators`, or `ProvincialOfficers` row exists until the person accepts.

- `POST /admins/invitations` creates the row and queues an `invitation` email. The email carries the username, which is the lowercased invited email, and a link built on `FRONTEND_URL`.
- The link holds a random 256-bit token. The database stores only its SHA-256 hash and an expiry 10 minutes ahead.
- `POST /authentication/accept-invitation` takes the token and a password. One transaction deletes the Invitation, re-checks that the email is free, creates the account, and creates the role's profile row.
- The `DELETE` is the claim. Concurrent accepts serialize on the row lock, so exactly one gets the row.
- Every refusal returns the same `400 { "message": "invalid token" }`, whether the token is unknown, expired, or used, or the email was taken after the invite. A refusal after the claim rolls back, so the Invitation stays pending.
- An accepted Invitation leaves no row. No history of who invited whom is kept, because DOED has one Admin.

**Invited accounts skip the seeded first-login step.** Acceptance creates the profile row with `isChangePassword = true`. The person has already given a real email and a password, so they get OTP from the first login and never reach `PATCH /evaluators/password`.

Seeded accounts keep `isChangePassword = false` until they finish that step, as ADR-0002 records. Seeded accounts have placeholder emails, so an OTP sent to them would never arrive. That difference is why the two kinds of account behave differently at first login.

Each invitable role is one row in the `roleRules` registry in `src/service/invitation.ts` and one member of the target union. The `Invitations_role_target` CHECK constraint rejects a row whose columns do not match its role.

## Alternatives considered

**A pending flag on `Accounts`.** Every query that reads accounts or evaluators would need a filter. Login, enrollment, and region review would each be one missed filter away from treating a pending person as real. A separate table needs no filter, because a pending person has no row to read.

**Keeping accepted Invitations.** A history row would need a status column and would have to be excluded from the unique-email rule. Nothing reads that history, so `Invitations` holds pending rows only. Revisit this if DOED has several Admins.

## Consequences

- The email is checked twice, at invite and at accept, because an account can claim it in between. `Accounts` has no case-insensitive unique index, so the two checks use `lower(...)`. The unique indexes still catch an exact-case race at insert.
- The token is valid for 10 minutes. An Admin should warn the person just before sending.
- The acceptance link path `/accept-invitation` is a default that the frontend must agree to.
- Production does not run schema pushes, so `Invitations` must be created by hand before release. The worker image must be rebuilt and pushed, or Invitation emails are not delivered.
