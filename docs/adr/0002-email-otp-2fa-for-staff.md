# ADR 0002: Email OTP as mandatory 2FA for staff accounts

**Status:** Accepted

## Context

The three privileged staff roles — `DOED`, `Evaluator`, `Provincial` — authenticate with username + password only. These accounts have broad cross-factory data visibility (DOED sees all factories, Evaluator a region, Provincial a province), so a stolen password is a high-impact compromise. We want a second authentication factor for these roles. Factory accounts (external, high-volume, own-Cover-only) are out of scope.

The realistic channels given the stack were: email OTP, TOTP (authenticator app), or SMS OTP.

- Email infrastructure already exists (BullMQ `email` queue + SMTP), and every `accounts` row has a unique, mandatory `email`.
- There is **no SMS provider** — SMS would mean new third-party infra, recurring cost, and credentials.
- TOTP would require a new dependency, a per-user secret column, a QR enrollment flow, and backup codes.

## Decision

Adopt **mandatory email OTP** for all staff logins.

- After a correct staff password, `/login` mints a **2FA Challenge** in Redis (`2fa:challenge:{challengeId}` → `{ accountId, codeHash, attempts }`, 5-min TTL) and queues a 6-digit code by email. No auth cookies are issued until `POST /login/verify-otp` succeeds. `POST /login/resend-otp` re-sends, throttled to 60s.
- The OTP is stored hashed (`Bun.SHA256`); the challenge is single-use; 5 wrong codes kill the challenge; 10 cumulative failures in 15 min lock the account's 2FA for 15 min.
- 2FA state lives **entirely in Redis — no schema change and no per-user enrollment**.
- **First-login exemption:** while `isChangePassword === false`, Evaluator/Provincial logins skip OTP (they set their real email during that first password change). DOED is subject to OTP from the start.
- OTP is enforced at **login only**; refresh-token rotation extends an already-2FA'd session and never re-prompts. `REFRESH_TOKEN_EXP` governs when 2FA recurs.

## Reasons

- **Reuses existing infrastructure** — email queue, SMTP, and the Redis-token pattern already used for password reset. No new dependency, no SMS provider, no migration.
- **Mandatory + no opt-in** means there is no privileged staff account left without a second factor, and no toggle UI or `is2faEnabled` column to build.
- **TOTP and SMS were rejected for v1** on build cost / new-infra grounds, not security merit. TOTP can be layered on later as an additional method.

## Consequences

- **Email becomes a login-critical path for staff.** If the `bun run worker` process is down or SMTP is unreachable, no staff member can log in. OTP jobs are queued at higher priority than bulk jobs, and the worker now warrants uptime monitoring. (Previously an SMTP outage only affected password resets and reminders.)
- Email OTP is **2-step, not strictly 2-factor** — a compromised mailbox yields both factors. Accepted for v1; the relevant threat is stolen passwords, not mailbox takeover. If mailbox compromise becomes the concern, revisit with TOTP.
- **"Remember this device" / trusted-device skip is out of scope** for v1. If login frequency is a complaint, the cheaper lever is lengthening `REFRESH_TOKEN_EXP`.
- 6-digit numeric codes are only safe because of the attempt limits and challenge-issuance throttle; those thresholds must not be loosened without re-evaluating brute-force exposure.
