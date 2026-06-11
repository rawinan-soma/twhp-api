---
intent: 002-staff-2fa
created: 2026-06-09T00:00:00Z
completed: 2026-06-09T00:00:00Z
status: complete
---

# Inception Log: 002-staff-2fa

## Overview

**Intent**: Mandatory email-OTP two-factor authentication for staff accounts (DOED, Evaluator, Provincial).
**Type**: brown-field (enhancement to existing authentication flow)
**Created**: 2026-06-09

## Artifacts Created

| Artifact       | Status | File                                       |
| -------------- | ------ | ------------------------------------------ |
| Requirements   | ✅     | requirements.md                            |
| System Context | ✅     | system-context.md                          |
| Units          | ✅     | units/001-staff-2fa/unit-brief.md          |
| Stories        | ✅     | units/001-staff-2fa/stories/\*.md (9)      |
| Bolt Plan      | ✅     | memory-bank/bolts/003-staff-2fa, 004-staff-2fa |

## Summary

| Metric                      | Count |
| --------------------------- | ----- |
| Functional Requirements     | 10    |
| Non-Functional Requirements | 8     |
| Units                       | 1     |
| Stories                     | 9     |
| Bolts Planned               | 2     |

## Units Breakdown

| Unit | Stories | Bolts | Priority |
| ---- | ------- | ----- | -------- |
| 001-staff-2fa | 9 | 2 (003, 004) | Must |

## Decision Log

| Date | Decision | Rationale | Approved |
| ---- | -------- | --------- | -------- |
| 2026-06-09 | 2FA scope = DOED + Evaluator + Provincial (Factory excluded) | Privileged cross-factory visibility; factories are external/high-volume | Yes (grill) |
| 2026-06-09 | Channel = Email OTP (reject TOTP/SMS for v1) | Reuses email+Redis infra, no new dependency, no SMS provider | Yes (ADR 0002) |
| 2026-06-09 | Mandatory, with first-login exemption for Eval/Provincial | Uniform protection, no schema change; avoids OTP to placeholder email | Yes (grill) |
| 2026-06-09 | Pending state = opaque Redis challengeId in response body | Isolates pending state from auth cookies; mirrors reset-password pattern | Yes (grill) |
| 2026-06-09 | Lockout = 5/challenge, 1 active challenge, 60s resend, 10 fails/15min lock | Bounds brute force vs 10^6 space while forgiving fat-fingering | Yes (grill) |
| 2026-06-09 | OTP at login only; refresh rotation never re-prompts | Standard 2FA; gated by writing hashedRefreshToken post-OTP | Yes (grill) |
| 2026-06-09 | Trusted-device skip out of scope (v2) | Security give-back not justified for small privileged cohort | Yes (grill) |

## Scope Changes

| Date | Change | Reason | Impact |
| ---- | ------ | ------ | ------ |

## Ready for Construction

**Checklist**:

- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete (Checkpoint 3) — approved 2026-06-09

## Next Steps

1. Human review at Checkpoint 3 (this stop)
2. Begin Construction Phase with unit `001-staff-2fa`
3. Execute: `/specsmd-construction-agent --unit="001-staff-2fa"` — start with bolt `003-staff-2fa`

## Dependencies

Single unit, no cross-unit dependencies. Consumes existing authentication, Redis (`redisConnector`), and BullMQ `email` queue/worker.
