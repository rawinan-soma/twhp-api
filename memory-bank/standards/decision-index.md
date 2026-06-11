---
last_updated: 2026-06-09T09:00:00Z
total_decisions: 2
---

# Decision Index

This index tracks all Architecture Decision Records (ADRs) created during Construction bolts.
Use this to find relevant prior decisions when working on related features.

## How to Use

**For Agents**: Scan the "Read when" fields below to identify decisions relevant to your current task. Before implementing new features, check if existing ADRs constrain or guide your approach. Load the full ADR for matching entries.

**For Humans**: Browse decisions chronologically or search for keywords. Each entry links to the full ADR with complete context, alternatives considered, and consequences.

---

## Decisions

### ADR-2: Accept SMTP as a Login-Critical Dependency (No Fallback Channel)
- **Status**: accepted
- **Date**: 2026-06-09
- **Bolt**: 003-staff-2fa (staff-2fa)
- **Path**: `bolts/003-staff-2fa/adr-2-smtp-login-critical.md`
- **Summary**: Adding email-OTP 2FA makes SMTP a blocking dependency for all DOED, Evaluator, and Provincial staff logins. We accept this risk in v1 with no fallback channel; BullMQ retries are the sole resilience mechanism.
- **Read when**: Working on authentication flows, email delivery, or any feature that adds new login-blocking dependencies; evaluating fallback channels or degraded-mode behaviour for staff login

### ADR-1: Issue Fresh OTP Code on Resend (vs. Replay Same Code)
- **Status**: accepted
- **Date**: 2026-06-09
- **Bolt**: 003-staff-2fa (staff-2fa)
- **Path**: `bolts/003-staff-2fa/adr-1-fresh-code-on-resend.md`
- **Summary**: When a staff user requests OTP resend, a new code is generated and the old one is invalidated. The per-challenge attempt counter is also reset to 0.
- **Read when**: Working on OTP resend logic, multi-attempt flows, or any feature involving time-limited one-use codes
