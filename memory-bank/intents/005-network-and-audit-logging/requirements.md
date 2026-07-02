---
intent: 005-network-and-audit-logging
phase: inception
status: draft
created: 2026-06-22T00:00:00Z
updated: 2026-06-22T00:00:00Z
---

# Requirements: Network & Accountability (Audit) Logging

## Intent Overview

Add **two distinct, persisted logging facilities** to the TWHP API, capturing the two
different questions logs answer:

1. **Network log (`network_logs` table)** — the *traffic* record: one row per HTTP
   request reaching the API (which endpoint, by what method, resulting status, latency,
   source IP, user-agent, and the authenticated account if any). This persists the
   information the existing `@bogeychan/elysia-logger` pipeline (`src/index.ts:19-44`)
   already streams to **stdout**, into a queryable table. Answers *"what traffic hit the
   system?"*

2. **Accountability log (`audit_logs` table)** — the *who-did-what* trail: a chronological,
   append-only record of **every state-changing domain action** (covers, answers/verdicts,
   enrollments, scores, etc.) **and every auth event** (login success/failure, logout, 2FA
   challenge/verify, token refresh, role/permission change), each attributed to the acting
   identity. Answers *"who performed this action, when, and what was the outcome?"*

These are intentionally **separate tables** because they answer separate questions and have
very different write volumes and shapes: the network log is high-volume, the audit log is
low-volume but cross-cutting. **Both tables retain 180 days** of history via a shared
retention purge. The existing `coverLogs` / `answerLogs` status-history tables **continue to
exist and are not replaced** — `audit_logs` is an additive trail that also covers actions
those tables never recorded (auth, enrollment, score actions) and adds actor role + action
verb + outcome.

**This intent is write-only**: both tables are populated, but **no read/query API endpoints**
are built here (inspect directly in the DB). Read endpoints, dashboards, and alerting are
explicitly deferred to a future intent.

## Business Goals

| Goal | Success Metric | Priority |
|------|---------------|----------|
| Persist a queryable network/access traffic record | Every non-health HTTP request produces one `network_logs` row with method, path, status, latency, ip, account | Must |
| Persist a tamper-evident accountability trail | Every state-changing domain action + auth event produces one attributed `audit_logs` row | Must |
| Logging never degrades the request path | Log writes are non-blocking; a log-write failure never fails the business operation and never adds measurable p95 latency | Must |
| Bound storage growth | A daily retention job purges BOTH `network_logs` and `audit_logs` rows older than the configured window (180 days) | Must |
| Preserve secret hygiene | No tokens, passwords, OTP codes, or raw `authorization` header values are ever written to either table | Must |

---

## Functional Requirements

### FR-1: `network_logs` table
- **Description**: A new Drizzle table in the single-file schema (`src/drizzle/schema.ts`)
  persisting one row per HTTP request that reaches the API (excluding the health check).
- **Acceptance Criteria**:
  - Columns (final names settled in Construction): `id` (serial PK), `method`, `path`
    (route pathname), `route` (matched route pattern when available), `status` (int),
    `latency_ms` (int), `ip` (from `x-forwarded-for`), `user_agent`, `account_id`
    (nullable integer, no FK — anonymous when unauthenticated), `request_id` (nullable
    correlation id), `created_at` (timestamp, Bangkok-consistent with existing logger).
  - `/twhp/api/health` is **excluded** (parity with the existing logger `ignore` rule at
    `src/index.ts:39`).
  - The row is written for **all** terminal statuses including 4xx/5xx (unlike the current
    stdout `autoLogging.ignore`, which skips errors because they are logged elsewhere).
  - Created via schema.ts + `bun run db:push` — **no** hand-edited migration files.
- **Priority**: Must

### FR-2: Network-log capture pipeline (non-blocking)
- **Description**: Capture is wired into the global Elysia lifecycle alongside the existing
  logger in `src/index.ts`, reusing the same request serializer fields where possible
  (`method, url, ip (x-forwarded-for), userAgent`).
- **Acceptance Criteria**:
  - The DB insert is **fire-and-forget** (not awaited in the response path); a failed
    insert is swallowed-and-logged, exactly like the current email-queue failure handling —
    it must **never** turn a 2xx into a 5xx.
  - Latency is measured per request (response time) and stored in `latency_ms`.
  - `account_id` is resolved from `jwtPayload.sub` when present (same `Number(jwtPayload.sub)`
    convention as intent 004); `null` for unauthenticated requests.
  - Existing stdout logging behaviour in `src/index.ts` continues to work (this adds
    persistence; it does not remove the pino/stdout stream).
- **Priority**: Must

### FR-3: `audit_logs` table
- **Description**: A new Drizzle table persisting the accountability trail, append-only.
- **Acceptance Criteria**:
  - Columns (final names settled in Construction): `id` (serial PK), `account_id`
    (nullable integer, no FK — null/anonymous for pre-auth failures), `actor_role`
    (nullable; one of the `Role` enum values when known), `action` (string identifying the
    action, e.g. `cover.finalize`, `answer.verdict`, `auth.login`, `auth.role_change`),
    `entity_type` (nullable, e.g. `cover`, `answer`, `enroll`, `account`), `entity_id`
    (nullable integer), `metadata` (nullable `jsonb` for action-specific context),
    `outcome` (`success` | `failure`), `ip`, `request_id` (nullable), `created_at`.
  - Table is **append-only**: the application performs `INSERT` only — no `UPDATE`/`DELETE`
    paths exist (except the retention job, see FR-8).
  - `metadata` **must not** contain secrets (see FR-7).
  - Created via schema.ts + `bun run db:push`.
- **Priority**: Must

### FR-4: Audit capture — state-changing domain actions
- **Description**: Every mutating domain operation records an `audit_logs` row attributed to
  the actor. Scope is **all state-changing actions** (the user selected the broadest scope).
- **Acceptance Criteria**:
  - Covered action families include (non-exhaustive, refined in Units/Stories): cover
    lifecycle transitions, answer submit/verdict/finalize, factory negotiation actions,
    enrollment create/update, and any score-affecting mutation.
  - Each row records: actor (`account_id` + `actor_role`), `action`, `entity_type` +
    `entity_id`, `outcome`, and relevant `metadata` (e.g. from→to status, verdict choice).
  - Capture is via an **explicit** audit helper invoked at the service mutation sites (not
    inferred from HTTP alone), because accurate `entity_id` and before/after context are
    only available in the service layer.
  - Read-only endpoints (GET lists, score reports) do **not** produce audit rows (they are
    covered by the network log instead).
- **Priority**: Must

### FR-5: Audit capture — authentication & authorization events
- **Description**: Auth-relevant events are recorded in `audit_logs` (the user explicitly
  added auth events to the broad scope: "1 + 3").
- **Acceptance Criteria**:
  - Captured events: login **success** and **failure**, logout, 2FA challenge issued /
    verified / failed (intent 002), token refresh, and any role/permission change.
  - Login **failure** and other pre-authentication failures record `account_id = null`
    (or the attempted identifier in `metadata`, secrets-free) with `outcome = failure`.
  - These events integrate with the auth middleware/flow (`src/middleware/jwt.ts`,
    `src/middleware/rbac.ts`, and the login/2FA services).
- **Priority**: Must

### FR-6: Actor attribution
- **Description**: Both logs attribute the acting account where one exists.
- **Acceptance Criteria**:
  - `account_id` is derived from `jwtPayload.sub` (consistent with existing convention);
    `actor_role` from the derived JWT payload / RBAC context.
  - Unauthenticated / pre-auth requests record `account_id = null` rather than failing.
  - No FK is placed on `account_id` (mirrors the non-FK pattern of `answerLogs.evaluation_id`
    / `coverLogs.evaluator_id`), so historical rows survive account deletion.
- **Priority**: Must

### FR-7: Secret & PII hygiene
- **Description**: Neither table stores credentials or sensitive payloads.
- **Acceptance Criteria**:
  - No password, JWT/refresh token, OTP code, or raw `Authorization` header value is ever
    written. (Preserve the existing logger behaviour at `src/index.ts:28`, which stores
    `authorization` as a **boolean presence flag**, not the value.)
  - `metadata` is restricted to non-sensitive, action-relevant fields.
  - Request/response **bodies are not persisted** in either table in this intent.
- **Priority**: Must

### FR-8: Retention — 180-day purge for BOTH logs
- **Description**: A scheduled job bounds growth of **both** log tables by deleting old rows.
- **Acceptance Criteria**:
  - A **daily BullMQ repeatable job** (mirroring the pattern in `src/workers.ts:5-14`,
    cron-style `repeat.pattern`) deletes rows from **both** `network_logs` **and**
    `audit_logs` where `created_at` is older than the retention window.
  - Retention window = **180 days** for both tables, configurable via an env var validated
    in `src/config.ts` (default 180). A single shared window applies to both (separate
    windows are out of scope unless requested later).
  - The job is registered from the worker entrypoint and runs in the worker process
    (`bun run worker`), not the API process.
  - Purge failures are logged and retried per the existing job options; they never affect
    the API.
- **Priority**: Must

### FR-9: Write-only scope (no read API)
- **Description**: This intent delivers capture + retention only.
- **Acceptance Criteria**:
  - **No** new HTTP endpoints are added to read, list, filter, or export either log.
  - Inspection is done directly against the database for now.
  - The table shapes are designed to make a future read/query intent straightforward
    (indexable `created_at`, `account_id`, `action`), but no API is built here.
- **Priority**: Must

---

## Non-Functional Requirements

### Performance & Reliability
| Requirement | Target |
|-------------|--------|
| No added request latency | Log writes are fire-and-forget / out of the response path; no measurable change to p95 |
| Failure isolation | A log-write or audit-write failure **never** fails or alters the underlying business response (swallow-and-log, like email-queue failures) |
| Audit atomicity (best-effort) | Where an audit row logically belongs to a domain transaction, prefer writing it within/alongside that txn; never let it block the txn's success path |

### Integrity & Growth
| Requirement | Target |
|-------------|--------|
| Append-only audit | `audit_logs` is INSERT-only at the application layer; the **only** deletion path is the shared 180-day retention purge (FR-8) |
| Bounded growth | Both tables purged at 180 days; `network_logs` ≈ 1 row/request, `audit_logs` far fewer (mutations + auth only) |

### Security
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Secret redaction | No tokens/passwords/OTP/raw auth header | FR-7; preserve `authorization`-as-boolean behaviour |
| Attribution integrity | Account id from verified `jwtPayload` only | No client-supplied actor id is trusted |

---

## Constraints

### Technical Constraints
**Project-wide standards** loaded by Construction Agent.

**Intent-specific:**
- New tables added to the **single-file** `src/drizzle/schema.ts`; applied via
  `bun run db:push`. **Do not** hand-edit drizzle migration output.
- New env var(s) (retention window) added in `src/config.ts` — not read via `Bun.env`
  directly elsewhere.
- Network capture wires into the **existing** Elysia lifecycle in `src/index.ts` (alongside
  the current `logger()` plugin), reusing its request serializer fields; do not stand up a
  parallel logging framework.
- Audit capture uses an **explicit service-layer helper** (e.g. an `auditService.record()`
  singleton via the `createXxxService(db)` factory pattern) invoked at mutation sites + auth
  hooks — not HTTP-only inference.
- Retention job reuses the **BullMQ repeatable-job** mechanism in `src/workers.ts` /
  `src/worker/*`; runs in the worker process.
- File I/O is irrelevant here; all writes are DB inserts.

### Business Constraints
- No dependency on other in-flight intents. Auth-event capture (FR-5) **touches** the 2FA
  flow from intent 002 if/when present, but does not require 002 to be complete (it logs
  whatever auth events exist today, and extends to 2FA events when those land).

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| `x-forwarded-for` carries the real client IP (app runs behind a proxy) | `ip` is the proxy's, not the client's | Same source the current logger already uses (`src/index.ts:29`); accept parity, revisit if proxy config changes |
| `jwtPayload.sub` is the `accounts.id` | Wrong actor attributed | Same `Number(jwtPayload.sub)` convention as intent 004 |
| Fire-and-forget writes are acceptable (rare lost rows under crash) | A handful of log rows may be lost on hard crash | Accepted for v1; audit-critical rows can be written in-txn where it matters (NFR) |
| 180-day window is correct for **both** logs | Over/under retention; an accountability trail older than 180d is unrecoverable | Configurable via env; PO explicitly chose 180d for both (revisit if compliance requires longer audit history) |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| **Audit-log retention** | PO | Checkpoint 2 | **RESOLVED — 180 days for both logs** (shared window, FR-8) |
| **Relationship to `coverLogs`/`answerLogs`** | PO | Checkpoint 2 | **RESOLVED — keep both; `audit_logs` is additive, does NOT replace the domain status-history tables** |
| **Action taxonomy**: is `action` a free-text string or a constrained enum/pgEnum? Free-text is flexible but unvalidated; an enum is safer but needs maintenance. **Recommendation: typed string constants in code, plain `text` column (no pgEnum) to avoid churn.** | PO | Checkpoint 3 | Pending |
