---
bolt: 003-staff-2fa
created: 2026-06-09T09:00:00Z
status: accepted
superseded_by:
---

# ADR-2: Accept SMTP as a Login-Critical Dependency (No Fallback Channel)

## Context

Adding email-OTP 2FA to staff login makes SMTP delivery a **blocking dependency** for all DOED, Evaluator, and Provincial logins. Previously, SMTP was used only for password-reset emails — a non-blocking, non-time-sensitive flow. After this feature, an SMTP outage prevents all affected staff from logging in until either the SMTP service recovers or the challenge TTL expires.

The system already relies on BullMQ + the email worker for all outbound email. The 2FA worker job uses elevated priority (`priority: 1`) and retries (`attempts: 3, backoff: 5000ms`).

## Decision

Accept SMTP as a login-critical dependency for staff accounts. No fallback delivery channel (SMS, TOTP, backup code) is implemented in v1. The existing BullMQ retry policy is the sole resilience mechanism.

## Rationale

Implementing a fallback channel (SMS, authenticator app, backup codes) in v1 would significantly increase scope, introduce new dependencies, and require additional infrastructure (SMS gateway, TOTP secret storage). The project constraint is no new npm dependency and no DB schema change for this bolt.

The risk is accepted as manageable in v1 given: (a) SMTP infrastructure is already operational and monitored; (b) BullMQ retries absorb transient SMTP failures; (c) the OTP TTL (300s) gives the worker multiple retry windows; (d) staff login volume is low enough that an outage would be noticed and escalated quickly via other channels.

Alternative 2FA channels are deferred to v2 and tracked.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| SMS fallback via third-party gateway | Survives SMTP outage | New dependency, cost, phone number storage, significant scope | Out of scope for v1; no DB schema change permitted |
| TOTP (authenticator app) | No per-login email; works offline | TOTP secret storage requires DB schema change; UX setup complexity | Explicitly out of scope (unit brief); no schema change constraint |
| Backup codes | Low-tech fallback | Requires secure storage + UI | Significant scope increase; deferred to v2 |
| Degraded-mode bypass (skip 2FA on SMTP down) | Avoids lockout | Removes the security guarantee entirely; defeats the feature's purpose | Unacceptable security trade-off |

## Consequences

### Positive

- No new infrastructure, dependency, or schema change required in v1
- Simple, auditable flow: every staff login always goes through one known channel
- Elevated BullMQ priority + retries provide reasonable resilience for transient failures

### Negative

- SMTP outage = staff login outage for DOED / Evaluator / Provincial roles
- No self-service recovery path for affected users during an outage

### Risks

- **SMTP hard failure after retries**: Job lands in BullMQ failed set; user cannot log in. Mitigated by: (a) monitoring BullMQ failed queue for `2fa-otp` jobs; (b) operational runbook to manually clear/re-enqueue; (c) v2 roadmap includes fallback channel
- **Email delivery latency**: Delayed email frustrates users. Mitigated by priority-1 queue position and resend endpoint (story 008)

## Related

- **Stories**: 005-otp-email-job, 001-otp-challenge-lifecycle
- **Standards**: —
- **Previous ADRs**: —
