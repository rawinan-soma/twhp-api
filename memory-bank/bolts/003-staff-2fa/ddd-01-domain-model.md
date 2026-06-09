---
stage: model
bolt: 003-staff-2fa
created: 2026-06-09T08:00:00Z
---

## Static Model: Staff Email-OTP 2FA (Service Core)

### Entities

- **StaffAccount**: id (accountId), username, email, role (`DOED`/`Evaluator`/`Provincial`), isChangePassword — Business rules: determines whether OTP is required via `requiresOtp`; Factory role is always exempt; Evaluator/Provincial on first-login (`isChangePassword = true`) are exempt; otherwise OTP is mandatory
- **TwoFaChallenge**: challengeId (opaque hex), accountId, codeHash (SHA-256 hex), attempts (int 0–5), TTL 300s — Business rules: single-use (deleted on success); max 5 wrong attempts destroys the challenge; at most one active challenge per account at any time; stored exclusively in Redis
- **FailureCounter**: accountId, count (int), windowTtl 900s — Business rules: incremented on every wrong verification attempt; threshold ≥ 10 within the 15-minute window → account is locked out; cleared on successful verification; stored exclusively in Redis
- **ResendThrottle**: challengeId, windowTtl 60s — Business rules: set on challenge creation and on each resend; prevents another resend or re-issue within 60 seconds; stored exclusively in Redis
- **OtpEmailJob**: email, code (plaintext 6-digit, transient in BullMQ queue) — Business rules: enqueued at `priority: 1` (higher than bulk jobs); retried up to 3 times with 5 000ms backoff; code exists only in the BullMQ job payload and the email body — never in Redis or application logs

---

### Value Objects

- **OtpCode**: 6-digit zero-padded numeric string (`000000`–`999999`) — Constraints: generated via `crypto.randomInt(0, 1_000_000)` + zero-pad; transient (exists only long enough to hash and enqueue); never written to Redis or logs; equality not compared in plaintext — always via hash
- **OtpHash**: SHA-256 hex digest of OtpCode — Constraints: produced by `Bun.SHA256.hash(code, "hex")`; the only form of the code persisted in Redis; equality by value comparison against a re-hashed candidate
- **ChallengeId**: hex-encoded 32 random bytes — Constraints: opaque, URL-safe, returned to client as-is; not guessable; equality by string comparison
- **MaskedEmail**: first character of local part + fixed `****` + `@domain` — Constraints: pure transformation; single-char local part → `*@domain`; full local part never present in output; domain preserved verbatim

---

### Aggregates

- **TwoFaChallenge Aggregate Root**: Members: challengeId, accountId, codeHash, attempts — Invariants: (1) Single-use — delete key on successful verification; (2) Attempt cap — challenge destroyed when attempts reaches 5, client told to restart login; (3) One-active-challenge — a second `createChallenge` for the same account re-uses or replaces the existing challenge (governed by the one-active rule, constrained by 60s resend throttle); (4) TTL — Redis expires key after 300s regardless of attempts
- **FailureCounter Aggregate Root**: Members: accountId, count, window — Invariants: (1) Count resets via TTL (not on login success); (2) count ≥ 10 within window → lockout until key expires; (3) Explicit `DEL` on successful verify to allow the account to log in again without waiting out the window

---

### Domain Events

- **OtpChallengeCreated**: Trigger: `createChallenge` succeeds after correct password — Payload: challengeId, accountId, maskedEmail, code (transient — passed to OtpEmailJob only)
- **OtpChallengeVerified**: Trigger: correct code, challenge present, account not locked — Payload: challengeId, accountId, resolved account row
- **OtpVerificationFailed**: Trigger: wrong code on an active challenge — Payload: challengeId, accountId, attemptsRemaining
- **OtpChallengeDestroyed**: Trigger: 5th wrong code OR Redis TTL fires — Payload: challengeId, reason (`max_attempts` | `expired`)
- **AccountLockedOut**: Trigger: `FailureCounter.count` reaches 10 within 15-minute window — Payload: accountId, lockRemainingSeconds (approximate, derived from Redis TTL)
- **OtpResendRequested**: Trigger: `resendOtp` called and throttle not active — Payload: challengeId, email, code (transient — passed to OtpEmailJob only)

---

### Domain Services

- **TwoFaChallengeService** (extension of `authenticationService`):
  - Operations: `createChallenge(accountId, email)` → `{ challengeId }` — generates OTP, hashes it, stores challenge in Redis, enqueues `2fa-otp` job; `verifyChallenge(challengeId, code)` → `account | StatusError` — checks lockout, retrieves challenge, compares hash, enforces attempt cap, clears counter on success; `resendOtp(challengeId)` → `ok | 429/400` — checks throttle and lockout, re-enqueues job; `requiresOtp(role, isChangePassword)` → `boolean`; `maskEmail(email)` → `MaskedEmail`
  - Dependencies: TwoFaChallengeRepository, FailureCounterRepository, ResendThrottleRepository, OtpEmailDispatcher

- **OtpEmailDispatcher**:
  - Operations: `enqueueOtpEmail(email, code)` — adds `{ email, code }` to `emailQueue` under job name `"2fa-otp"` at `priority: 1, attempts: 3, backoff: 5000`; returns void; never blocks the request
  - Dependencies: BullMQ `emailQueue`

---

### Repository Interfaces

- **TwoFaChallengeRepository** (Redis-backed via `redisConnector`):
  - Entity: TwoFaChallenge
  - Methods: `create(challengeId, payload: { accountId, codeHash, attempts }, ttl: 300)` → `void`; `get(challengeId)` → `TwoFaChallenge | null`; `delete(challengeId)` → `void`; `findActiveByAccount(accountId)` → `challengeId | null` (for one-active-challenge check)
  - Key pattern: `2fa:challenge:{challengeId}`

- **FailureCounterRepository** (Redis-backed via `redisConnector`):
  - Entity: FailureCounter
  - Methods: `increment(accountId)` → `newCount: number` (INCR + EXPIRE 900 on first); `get(accountId)` → `count: number`; `clear(accountId)` → `void` (DEL); `isLocked(accountId)` → `boolean` (count ≥ 10)
  - Key pattern: `2fa:fail:{accountId}`

- **ResendThrottleRepository** (Redis-backed via `redisConnector`):
  - Entity: ResendThrottle
  - Methods: `isThrottled(challengeId)` → `boolean` (key exists?); `mark(challengeId, ttl: 60)` → `void` (SET NX EX 60)
  - Key pattern: `2fa:resend:{challengeId}`

---

### Ubiquitous Language

- **Staff Account**: an account with role `DOED`, `Evaluator`, or `Provincial`; Factory accounts are OTP-exempt by role, not by policy
- **2FA Challenge**: the server-side "password OK, OTP pending" state; lives only in Redis; not a session token
- **OTP** (One-Time Password): a 6-digit numeric code; single-use; delivered by email; validity is 300 seconds (challenge TTL)
- **Code Hash**: the SHA-256 hex digest of the OTP; the only form of the code ever written to persistent storage (Redis)
- **Challenge Lifecycle**: create → attempts accumulate on wrong code / verified on correct code → destroyed (success, max attempts, or TTL)
- **Attempt Cap**: 5 wrong codes per challenge; on the 5th the challenge is destroyed and the user must restart login
- **Cumulative Lockout**: account-scoped count of wrong codes across challenges within a 15-minute window; threshold 10 → 15-minute lockout; cleared on verified success
- **Resend Throttle**: a 60-second window that blocks a new OTP send for the same challenge; prevents email flooding
- **One-Active-Challenge**: invariant ensuring a single account has at most one pending 2FA challenge at a time
- **MaskedEmail**: the step-1 response email hint — `r****@gmail.com` — exposes only the first local character and the domain
- **First-Login Exemption**: Evaluators and Provincial Officers skip 2FA on their first login (`isChangePassword = true`); passes directly to cookie issuance
- **requiresOtp**: the decision function that maps `(role, isChangePassword)` to `boolean`; encapsulates all exemption logic in one place
- **2fa-otp job**: the BullMQ job payload `{ email, code }` that delivers the OTP via email; higher priority than bulk mail; login-critical
