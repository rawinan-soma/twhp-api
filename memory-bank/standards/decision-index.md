---
last_updated: 2026-06-23T04:27:07Z
total_decisions: 4
---

# Decision Index

This index tracks all Architecture Decision Records (ADRs) created during Construction bolts.
Use this to find relevant prior decisions when working on related features.

## How to Use

**For Agents**: Scan the "Read when" fields below to identify decisions relevant to your current task. Before implementing new features, check if existing ADRs constrain or guide your approach. Load the full ADR for matching entries.

**For Humans**: Browse decisions chronologically or search for keywords. Each entry links to the full ADR with complete context, alternatives considered, and consequences.

---

## Decisions

### ADR-4: Reuse `COOKIE_SECURE` as the Production Signal for the Dev OTP Bypass
- **Status**: accepted
- **Date**: 2026-06-23
- **Bolt**: 017-dev-otp-bypass (dev-otp-bypass)
- **Path**: `bolts/017-dev-otp-bypass/adr-4-cookie-secure-as-production-signal.md`
- **Summary**: The developer OTP bypass must be impossible in production, but the codebase has no `NODE_ENV`/`APP_ENV`. We reuse the already-required `COOKIE_SECURE === true` boolean as the production signal that hard-disables the bypass, avoiding a second drift-prone "is-prod" source. Trade-off: the guard is semantically coupled to a cookie-transport flag; migrate to an explicit `APP_ENV` if a non-HTTPS production tier ever appears.
- **Read when**: Working on the dev OTP bypass, authentication/login gating, environment/production detection, or any feature that needs to behave differently in production; reconsidering whether to introduce an explicit `APP_ENV`/`NODE_ENV` discriminator

### ADR-3: National Admin (DOED) as a Second ODPC-Level Finalizer — Unlocked
- **Status**: accepted
- **Date**: 2026-06-19
- **Bolt**: 011-admin-as-evaluator (admin-as-evaluator)
- **Path**: `bolts/011-admin-as-evaluator/adr-3-admin-national-odpc-second-finalizer.md`
- **Summary**: Letting a national DOED admin finalize any Cover with full ODPC parity adds a second potential finalizer, amending ADR-0003's single-finalizer-per-region model. We leave the two-finalizer window unguarded in v1 — no locking or region-claim — relying on the existing per-Answer invariants (`finished` is sticky/immutable; the finalize gate blocks unresolved commits) to keep double-commits benign.
- **Read when**: Working on the cover-review/finalize flow, admin-as-evaluator endpoints, concurrency/race-freedom assumptions, or any feature that adds a new actor able to transition a Cover; reconsidering ADR-0003's single-finalizer model

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
