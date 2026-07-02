---
intent: 006-dev-otp-bypass
phase: inception
status: context-defined
updated: 2026-06-23T00:00:00Z
---

# System Context: Developer OTP Bypass for Staff Login

## System Overview

A guarded developer convenience layered onto the existing two-step staff login ([[002-staff-2fa]]).
When a request to `POST /login` carries a secret `X-Dev-Bypass` header that matches the
configured `DEV_BYPASS_SECRET`, **and** the master flag `DEV_SKIP_OTP` is on, **and** the app
is not running in production (`COOKIE_SECURE === false`), a correct staff password completes on
the existing **non-OTP path** — cookies issued immediately, no Redis challenge, no `2fa-otp`
email. If any condition fails, the request behaves **exactly** as it does today. No database,
Redis, or queue change is introduced.

## Actors

| Actor | Type | Description |
|-------|------|-------------|
| **Developer / QA** | Human | Sends the `X-Dev-Bypass` header via curl/Postman/dev frontend to skip OTP in local/dev |
| **DOED / Evaluator / Provincial** | Human (account) | Any staff role; their login is the one whose OTP step is skipped when the bypass is active |
| **Factory** | Human (account) | Already OTP-free — entirely unaffected by this intent |

## External Systems

| System | Direction | Data Exchanged | Protocol |
|--------|-----------|---------------|----------|
| **PostgreSQL** | Inbound | `accounts` credential + role check (unchanged) | Drizzle ORM (SQL) |
| **Process env** | Inbound | `DEV_SKIP_OTP`, `DEV_BYPASS_SECRET`, `COOKIE_SECURE` read once into `env` at startup | `src/config.ts` |

No new external integrations. The bypass path actively **avoids** Redis (`2fa:*`) and the BullMQ
`email` queue that the normal OTP path uses.

## Data Flows

### `POST /login` — with bypass active

- Inbound: `{ username, password }` + header `X-Dev-Bypass: <secret>`.
- Verify password (`getAutheticatedAccount`) — **unchanged, runs first**. Wrong password → `401`.
- Evaluate `isDevOtpBypass(headerValue)` = `DEV_SKIP_OTP` && `!COOKIE_SECURE` && secret set &&
  `timingSafeEqual(header, secret)`.
- `!requiresOtp(role, isChangePassword) || isDevOtpBypass(...)` → issue `Authentication` +
  `Refresh` cookies, persist `hashedRefreshToken`, return `{ message, user }`. Log the OTP skip.

### `POST /login` — bypass inactive (header absent / wrong / flag off / production)

- Identical to current behaviour: staff requiring OTP get `{ twoFactorRequired, challengeId,
  email(masked) }` and no cookies; Factory/first-login get one-step cookies.

### Startup

- If `DEV_SKIP_OTP === true` while `COOKIE_SECURE === true`, emit a one-time warning that the
  dev OTP bypass is configured but **ignored** in production.

## High-Level Constraints

- Only `POST /login` is touched; verify-otp / resend-otp endpoints are untouched.
- No DB schema change, no new Redis key, no new queue job, no new npm dependency.
- New env vars declared/validated in `src/config.ts` only (no stray `Bun.env`).
- Timing-safe secret comparison via `node:crypto` (already imported in `authentication.ts`).

## Key NFR Goals

- **Security**: fail-closed defaults, constant-time secret compare, production hard-block,
  secret never logged/returned/stored; the bypass removes only the OTP factor, never the
  password check.
- **Compatibility**: requests without a matching header are byte-for-byte identical to today.
- **Performance**: one header read + one constant-time compare; no added I/O.

## System Context Diagram

```text
┌──────────────────────────────────────────────────────────┐
│ Developer / QA  (local or dev environment)               │
│   sends:  POST /login  + header  X-Dev-Bypass: <secret>  │
└──────────────────────────────────────────────────────────┘
            │  (1) password + header            ▲ (3) cookies + { message, user }
            ▼                                   │
┌──────────────────────────────────────────────────────────┐
│ TWHP API (ElysiaJS)  —  POST /login                      │
│   getAutheticatedAccount(user, pass)   ← unchanged       │
│   isDevOtpBypass(header) =                                │
│     DEV_SKIP_OTP && !COOKIE_SECURE && timingSafeEqual()  │
│   (!requiresOtp(...) || bypass) → issue cookies          │
└──────────────────────────────────────────────────────────┘
      │ (2) verify creds              ✗ NOT touched on bypass path:
      ▼                                  Redis 2fa:* · BullMQ email queue
┌──────────────┐
│ PostgreSQL   │
│ accounts +   │
│ role tables  │
└──────────────┘
```

**Flow:** (1) developer sends password + secret header → API verifies credentials against
PostgreSQL (2) → if the bypass gate passes, the OTP branch is skipped and cookies are issued
directly (3). The normal (no-header) path is unchanged and still uses Redis + the email queue.
