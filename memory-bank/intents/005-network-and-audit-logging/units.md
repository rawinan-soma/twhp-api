---
intent: 005-network-and-audit-logging
phase: inception
created: 2026-06-22T00:00:00Z
---

# Units: Network & Accountability (Audit) Logging

## Project Type: backend-api
Decomposition: domain-driven, `ddd-construction-bolt`. The two logging facilities are
genuinely independent (different layers, different code touchpoints), so they split into
two units, plus a small shared retention unit that depends on both tables existing.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-network-logging` | `network_logs` table + a **non-blocking** global capture pipeline alongside the existing `elysia-logger` in `src/index.ts` (one row per request, health excluded, all statuses, secret-safe, `account_id` from JWT) | FR-1, FR-2 | Must | ddd-construction-bolt |
| `002-accountability-logging` | `audit_logs` table + an `auditService.record()` helper (append-only, attributed, secret-safe) + instrumentation of all state-changing **domain** mutations and all **auth/authz** events | FR-3, FR-4, FR-5, FR-6 | Must | ddd-construction-bolt |
| `003-log-retention` | One shared daily BullMQ repeatable job (mirrors `src/workers.ts`) purging rows older than **180 days** from **both** tables + env config in `src/config.ts` | FR-8 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** `network_logs` table → `001-network-logging`
- **FR-2** Network capture pipeline (non-blocking) → `001-network-logging`
- **FR-3** `audit_logs` table → `002-accountability-logging`
- **FR-4** Audit: state-changing domain actions → `002-accountability-logging`
- **FR-5** Audit: auth & authz events → `002-accountability-logging`
- **FR-6** Actor attribution → `002-accountability-logging`
- **FR-8** Retention — 180-day purge for both logs → `003-log-retention`
- **FR-7** Secret & PII hygiene → **cross-cutting**, honored by both `001` and `002`
  (network serializer drops the `Authorization` value; audit `metadata` carries no secrets)
- **FR-9** Write-only scope (no read API) → **intent-level non-goal** (the absence of an API
  surface; no unit builds endpoints)

## Dependency Graph

    001-network-logging ─────────────┐
                                      ├──► 003-log-retention
    002-accountability-logging ──────┘     (needs BOTH tables to exist)

- `001-network-logging` — independent; provides `network_logs`.
- `002-accountability-logging` — independent; provides `audit_logs`. Internally,
  instrumentation depends on the table+helper foundation (sequenced by the bolt plan).
- `003-log-retention` — requires `network_logs` (from 001) **and** `audit_logs` (from 002)
  tables to exist before its purge job can run.

## Why three units

The network log (HTTP-lifecycle hook) and the audit log (service-layer helper +
instrumentation) touch **different layers and different files** and can be built/tested in
isolation — splitting them keeps each unit single-responsibility. Retention is a distinct
deployable concern (runs in the **worker** process, not the API) that operates on both
tables, so it is its own thin unit gated on both.

## Touchpoints in existing code (additive)

- `001`: `src/drizzle/schema.ts` (new table), `src/index.ts` (capture hook beside the
  existing `logger()` plugin).
- `002`: `src/drizzle/schema.ts` (new table), a new `src/service/audit.ts`, plus additive
  `auditService.record()` calls in existing mutators (`answer.ts`, `evaluator-review.ts`,
  enroll/cover/score services) and auth flow (`authentication.ts`, `middleware/jwt.ts`,
  `middleware/rbac.ts`, 2FA if present).
- `003`: `src/config.ts` (retention env), `src/workers.ts` (register job), new
  `src/worker/log-retention.ts` + `src/queue/*`.
