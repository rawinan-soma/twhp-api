---
stage: design
bolt: 003-staff-2fa
created: 2026-06-09T08:30:00Z
---

## Technical Design: Staff 2FA Service Core (003-staff-2fa)

### Architecture Pattern

**Layered Monolith — Service Extension**

No new layer is introduced. All 2FA logic extends `src/service/authentication.ts` via new exported functions on the existing `createAuthenticationService` factory. Redis interactions are inline within service functions (no separate repository class files — mirrors the existing `reset_password_token` pattern). The BullMQ email job reuses the existing `emailQueue` in `src/queue/email.ts` and the worker switch in `src/worker/email.ts`.

---

### Layer Structure

```text
┌─────────────────────────────────────┐
│  Route Layer (bolt 004)             │  ← Not in this bolt
│  src/routes/authentication/         │
├─────────────────────────────────────┤
│  Service Layer (this bolt)          │
│  src/service/authentication.ts      │  createChallenge, verifyChallenge,
│                                     │  resendOtp, requiresOtp, maskEmail
├─────────────────────────────────────┤
│  Queue / Worker                     │
│  src/queue/email.ts                 │  emailQueue.add("2fa-otp", ...)
│  src/worker/email.ts                │  case "2fa-otp": sendOtpEmail(...)
├─────────────────────────────────────┤
│  Infrastructure (Redis)             │
│  src/utils.ts → redisConnector      │  ioredis; SET/GET/DEL/INCR/EXPIRE
└─────────────────────────────────────┘
```

---

### Redis Key Design

| Key | Value | TTL | Purpose |
|-----|-------|-----|---------|
| `2fa:challenge:{challengeId}` | JSON `{ accountId, codeHash, attempts }` | 300s | Pending challenge state |
| `2fa:fail:{accountId}` | integer string (INCR) | 900s (set on first INCR) | Cumulative failure counter |
| `2fa:resend:{challengeId}` | `"1"` (marker) | 60s | Resend throttle |

**Pattern**: Mirror `reset_password_token` — `SET key value EX ttl` / `GET` / `DEL`. Stored values are JSON-stringified objects or plain integer strings. All keys use `:` namespace separator.

**One-active-challenge**: Stored as a reverse-lookup key `2fa:active:{accountId}` → `challengeId` (EX 300). On `createChallenge`, check this key first; if exists and the challenge key also exists, re-use or replace per resend throttle.

---

### Service Function Signatures

All functions are added to the `createAuthenticationService(db)` factory return object. They follow the existing return pattern: return `status(code, body)` on error paths, return plain value on success.

**2FA thresholds are environment-configurable** via `src/config.ts` (validated at startup), following the project's pattern of never reaching for `Bun.env` directly:

```ts
// src/config.ts additions (with sensible defaults via .default())
OTP_CHALLENGE_TTL:  t.Number({ default: 300 })   // seconds; Redis challenge key expiry
OTP_MAX_ATTEMPTS:   t.Number({ default: 5 })      // wrong codes before challenge destroyed
OTP_FAIL_WINDOW:    t.Number({ default: 900 })    // seconds; cumulative lockout window (15 min)
OTP_FAIL_THRESHOLD: t.Number({ default: 10 })     // cumulative wrong codes → lockout
OTP_RESEND_THROTTLE: t.Number({ default: 60 })    // seconds; minimum gap between resends
```

Service accesses them as `env.OTP_CHALLENGE_TTL` etc. (same as all other config values).

```ts
// Determines if account must go through OTP
requiresOtp(role: string, isChangePassword: boolean): boolean
  → true  if role is DOED, Evaluator, or Provincial AND isChangePassword is false
  → false if role is Factory OR isChangePassword is true

// Creates challenge, hashes OTP, stores in Redis, enqueues email
createChallenge(accountId: string, email: string): Promise<{ challengeId: string }>

// Verifies code against stored hash; enforces lockout + attempt cap
verifyChallenge(
  challengeId: string,
  code: string
): Promise<AccountRow | ElysiaCustomStatusResponse>
  → 429 if account locked out
  → 400 "invalid or expired challenge" if key missing
  → 401 + incremented attempts if code wrong
  → 401 "too many attempts, restart login" + challenge deleted if attempts === OTP_MAX_ATTEMPTS
  → AccountRow on success (challenge deleted, failure counter cleared)

// Re-enqueues the OTP email for the same challenge (throttle-gated)
resendOtp(challengeId: string): Promise<{ ok: true } | ElysiaCustomStatusResponse>
  → 400 if challenge doesn't exist
  → 429 if resend throttle active OR account locked out
  → { ok: true } + new resend throttle marker on success

// Pure masking helper
maskEmail(email: string): string
  → "r****@gmail.com" for "rawinan.soma@gmail.com"
  → "*@domain" for single-char local part
```

---

### OTP Generation & Hashing

```ts
import { randomBytes, randomInt } from "node:crypto";
import { Bun } from "bun";   // Bun.SHA256 already imported for refresh token

function generateOtp(): { code: string; codeHash: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = Bun.SHA256.hash(code, "hex");
  return { code, codeHash };
  // code is transient — caller enqueues email then discards
}
```

`randomInt` is already available in `node:crypto` alongside `randomBytes` (which the service already imports). No new dependency.

---

### createChallenge Flow

```text
1. Check OTP_FAIL_THRESHOLD → if locked, return 429
2. Check 2fa:active:{accountId} → if exists and challenge exists, apply one-active rule:
     - If resend throttle active (2fa:resend:{challengeId}) → return existing challengeId (no new email)
     - Else → DEL old challenge + active key, continue to create new
3. Generate challengeId = randomBytes(32).toString("hex")
4. Generate { code, codeHash } via generateOtp()
5. SET 2fa:challenge:{challengeId} = JSON.stringify({ accountId, codeHash, attempts: 0 }) EX 300
6. SET 2fa:active:{accountId} = challengeId EX 300
7. SET 2fa:resend:{challengeId} = "1" EX 60
8. emailQueue.add("2fa-otp", { email, code }, { priority: 1, attempts: 3, backoff: { type: "fixed", delay: 5000 } })
   // code leaves scope after this line
9. Return { challengeId }
```

---

### verifyChallenge Flow

```text
1. GET 2fa:fail:{accountId} → if count >= 10, return status(429, { message: "too many attempts" })
2. GET 2fa:challenge:{challengeId} → if null, return status(400, { message: "invalid or expired challenge" })
3. Parse challenge: { accountId, codeHash, attempts }
4. Hash candidate: candidateHash = Bun.SHA256.hash(code, "hex")
5. If candidateHash !== codeHash:
     a. INCR 2fa:fail:{accountId} (+ EXPIRE 900 on first INCR)
     b. attempts++
     c. If attempts >= OTP_MAX_ATTEMPTS:
          - DEL 2fa:challenge:{challengeId}
          - DEL 2fa:active:{accountId}
          - return status(401, { message: "too many attempts, please restart login" })
     d. Else: SET challenge with updated attempts EX (remaining TTL or reset to 300)
          return status(401, { message: "incorrect code", attemptsRemaining: OTP_MAX_ATTEMPTS - attempts })
6. On match:
     a. DEL 2fa:challenge:{challengeId}
     b. DEL 2fa:active:{accountId}
     c. DEL 2fa:fail:{accountId}   // clear cumulative counter on success
     d. Fetch account row from DB by accountId
     e. Return account row
```

---

### resendOtp Flow

```text
1. GET 2fa:challenge:{challengeId} → if null, return status(400, { message: "invalid or expired challenge" })
2. Parse challenge to get accountId
3. GET 2fa:fail:{accountId} → if count >= 10, return status(429, { message: "account locked" })
4. EXISTS 2fa:resend:{challengeId} → if exists, return status(429, { message: "please wait before resending" })
5. GET account email from DB by accountId (needed to re-enqueue)
6. Generate new { code, codeHash }
7. Update challenge in Redis: SET 2fa:challenge:{challengeId} = { accountId, codeHash, attempts: 0 } EX (reset TTL to 300)
   // resend resets attempts and issues a fresh code (design decision — see Note below)
8. SET 2fa:resend:{challengeId} = "1" EX 60
9. emailQueue.add("2fa-otp", { email, code }, { priority: 1, ... })
10. Return { ok: true }
```

**Design Decision — Fresh Code on Resend**: Resend issues a new code and resets attempts to 0. This is safer than re-sending the same code (which would remain valid for the window after the resend). The bolt notes flag this as the recommended approach ("fresh code + reset attempts"). The old codeHash is replaced atomically in step 7.

---

### maskEmail Implementation

```ts
function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return `*${email.slice(atIndex)}`; // malformed guard
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length === 1) return `*${domain}`;
  return `${local[0]}****${domain}`;
}
```

Pure function — no I/O. Colocated in `src/service/authentication.ts`.

---

### OTP Email Job & Worker

**Queue side** (`src/queue/email.ts` — no new file, new job name only):

```ts
emailQueue.add(
  "2fa-otp",
  { email, code },          // job data
  {
    priority: 1,            // lower number = higher priority in BullMQ
    attempts: 3,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { count: 10 },
  }
);
```

**Worker side** (`src/worker/email.ts` — add one case to existing switch):

```ts
case "2fa-otp": {
  await sendOtpEmail(job.data);  // new helper, modelled on sendPasswordResetEmail
  break;
}

async function sendOtpEmail({ email, code }: { email: string; code: string }) {
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: "รหัส OTP สำหรับเข้าสู่ระบบ",   // Thai subject
    text: [
      `รหัส OTP ของท่านคือ: ${code}`,
      `รหัสนี้จะหมดอายุใน 5 นาที`,
      `หากท่านไม่ได้ร้องขอรหัสนี้ กรุณาติดต่อผู้ดูแลระบบ`,
    ].join("\n\n"),
  });
  // Do NOT log the code value
}
```

---

### Security Design

| Concern | Approach |
|---------|----------|
| OTP plaintext exposure | Code never written to Redis or logs; exists only in memory + BullMQ job payload + email body |
| Redis value tamper | No user-controlled input is used as Redis key without prefixing; challengeId is server-generated |
| Brute force per challenge | 5-attempt cap + challenge destroyed → must restart login |
| Brute force across challenges | Cumulative `2fa:fail:{accountId}` counter; 10/15min threshold → 15-min lockout |
| Email flooding | 60-second resend throttle per challenge |
| Session before verify | No cookies/tokens issued until `verifyChallenge` succeeds; challengeId is not a token |
| SMTP failure | BullMQ retry (3×/5s); worker throws on failure so BullMQ retries; job lands in failed set for monitoring |
| First-login path | `requiresOtp` returns false when `isChangePassword=true` → cookies issued directly |

---

### NFR Implementation

| Requirement | Design Approach |
|-------------|----------------|
| Step-1 latency < 400ms | Email enqueue is async (off request path); Redis ops are single-digit ms |
| OTP never in plaintext storage | Hash-only Redis storage; transient code variable discarded after enqueue |
| Lockout bounds brute force | Two-layer limit: per-challenge (5) + per-account (10/15min) |
| Worker reliability | `attempts: 3, backoff: 5000` on BullMQ job; job survives worker restarts |
| No new dependencies | `randomInt` from `node:crypto` (already imported); `Bun.SHA256` (already used); `redisConnector` (existing util) |

---

### Integration Points

| File | Change Type | What Changes |
|------|-------------|-------------|
| `src/config.ts` | Extend | Add `OTP_CHALLENGE_TTL`, `OTP_MAX_ATTEMPTS`, `OTP_FAIL_WINDOW`, `OTP_FAIL_THRESHOLD`, `OTP_RESEND_THROTTLE` with defaults |
| `src/service/authentication.ts` | Extend | Add `requiresOtp`, `createChallenge`, `verifyChallenge`, `resendOtp`, `maskEmail`; reads thresholds from `env.*` |
| `src/worker/email.ts` | Extend | Add `case "2fa-otp":` + `sendOtpEmail` helper |
| `src/queue/email.ts` | No change | `emailQueue.add` call sites are in the service; queue definition unchanged |
| `src/utils.ts` | No change | `redisConnector` already exported; no new util needed |
