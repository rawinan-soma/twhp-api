---
intent: 002-staff-2fa
phase: inception
status: context-defined
updated: 2026-06-09T00:00:00Z
---

# System Context: Staff Email-OTP Two-Factor Authentication

## System Overview

A second authentication factor injected into the existing cookie-JWT login flow. For staff roles (`DOED`, `Evaluator`, `Provincial`), a correct password no longer issues session cookies directly — it creates a short-lived **2FA Challenge** in Redis and emails a 6-digit OTP. Cookies are issued only after the OTP is verified. Factory logins and Eval/Provincial first-logins keep the existing single-step behaviour. No database schema changes.

## Actors

| Actor | Type | Description |
|-------|------|-------------|
| **DOED Admin** | Human | Programme administrator; OTP enforced from first login (no first-login flow) |
| **Evaluator** | Human | Regional reviewer; OTP enforced after first-login password change |
| **Provincial Officer** | Human | Province-level oversight; OTP enforced after first-login password change |
| **Factory** | Human | External participant; **out of scope** — login unchanged, never OTP-gated |

## External Systems

| System | Direction | Data Exchanged | Protocol |
|--------|-----------|---------------|----------|
| **PostgreSQL** | Inbound | `accounts` (credentials, email, role, hashedRefreshToken), role tables for `isChangePassword` | Drizzle ORM (SQL) |
| **Redis** | In/Out | 2FA Challenge (`2fa:challenge:{id}`), failure counter (`2fa:fail:{accountId}`), resend throttle | `redisConnector` (ioredis) |
| **BullMQ `email` queue** | Outbound | `2fa-otp` job `{ email, code }` at elevated priority | Redis-backed queue |
| **`email` worker → SMTP** | Outbound | OTP email (Thai template) | nodemailer / SMTP |

No new external integrations — all dependencies already exist in the codebase.

## Data Flows

### Step 1 — Password (`POST /login`)

- Inbound: `{ username, password }` (no cookies required).
- Verify password (`bcrypt.compare`); determine role and `isChangePassword`.
- **Factory or first-login staff** → issue `Authentication`+`Refresh` cookies, return `{ message, user }` (unchanged path).
- **Normal staff** → mint Challenge in Redis (`{ accountId, codeHash, attempts }`, TTL 5 min), enqueue `2fa-otp` email job, return `{ twoFactorRequired: true, challengeId, email(masked) }`. **No cookies.**

### Step 2 — OTP (`POST /login/verify-otp`)

- Inbound: `{ challengeId, code }`.
- Look up Challenge; check lockout (`2fa:fail:{accountId}`); compare `SHA256(code)` to `codeHash`.
- Success → delete Challenge, issue cookies + write `hashedRefreshToken`, return `{ message, user }`.
- Failure → increment attempts + failure counter; `400`/`401`/`429` per state.

### Resend (`POST /login/resend-otp`)

- Inbound: `{ challengeId }`. If last send > 60s ago, re-enqueue `2fa-otp` for the same Challenge; else `429`.

### Session continuation (unchanged)

- Access-token expiry → `jwtPlugin.rotateToken` silently rotates `Refresh`. **No OTP re-prompt** — rotation only succeeds because `hashedRefreshToken` was written post-OTP.

## High-Level Constraints

- No DB schema change; 2FA state is Redis-only.
- No new npm dependency — reuse `jose`, `bcrypt`, `Bun.SHA256`, `node:crypto`, `redisConnector`, BullMQ `email` queue.
- Preserve byte-compatible one-step `/login` response for Factory and first-login paths.
- New endpoints autoloaded from `src/routes/authentication/index.ts`.

## Key NFR Goals

- **Security**: brute force bounded to ~10 guesses / 15 min against a 10⁶ space; OTP hashed at rest; pending state isolated from auth cookies.
- **Reliability**: OTP email retried (`attempts: 3, backoff: 5000`); email worker is now login-critical and must be monitored.
- **Performance**: step-1 p95 < 400ms (email send is async, off the request path); verify p95 < 300ms.

## System Context Diagram

```text
┌────────────────────────────────────────────────────────┐
│ Staff — DOED · Evaluator · Provincial                  │
│   DOED        → OTP from first login                   │
│   Eval / Prov → OTP after first-login change           │
└────────────────────────────────────────────────────────┘
          │                   ▲
          ▼                   │
┌────────────────────────────────────────────────────────┐
│ TWHP API (ElysiaJS) — two-step login / auth flow       │
└────────────────────────────────────────────────────────┘
       │                 │                    │
       ▼                 ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌────────────────────┐
│ PostgreSQL   │  │ Redis        │  │ Email worker +     │
│ accounts +   │  │ 2fa:challenge│  │ SMTP               │
│ role tables  │  │ fail, resend │  │ sends 6-digit      │
│ (Drizzle)    │  │ (ioredis)    │  │ OTP to staff       │
└──────────────┘  └──────────────┘  └────────────────────┘
```

**Down = request, Up = response (Staff ↔ API):**

- `(1)` `POST /login` — staff path; `(3)` `POST /login/verify-otp`
- `(5)` response: `{ message, user }` + cookies (or step-1 `{ twoFactorRequired, challengeId, email }`)

**API → backends (left to right):**

- **PostgreSQL** — verify password, read role + `isChangePassword`
- **Redis** — `(2a)` create / verify Challenge, throttle, lockout
- **Email worker + SMTP** — `(2b)` enqueue `2fa-otp` job (BullMQ `email`, high priority) → `(4)` worker emails the 6-digit OTP to the staff user

**Flow:** (1) password → API verifies against PostgreSQL → (2) staff path mints a Redis Challenge and enqueues `2fa-otp` → worker emails the code (4) → (3) user submits the code → (5) API verifies against Redis, issues cookies, returns `{ message, user }`.
