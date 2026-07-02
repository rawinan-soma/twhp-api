---
intent: 006-dev-otp-bypass
created: 2026-06-23T00:00:00Z
completed: 2026-06-23T00:00:00Z
status: complete
---

# Inception Log: 006-dev-otp-bypass

## Overview

**Intent**: A development-only, header-gated login path that skips the email-OTP second
factor for staff accounts — master-switched by `DEV_SKIP_OTP`, activated per request by a
secret `X-Dev-Bypass` header, and hard-blocked in production.
**Type**: brown-field (enhancement to the [[002-staff-2fa]] authentication flow)
**Created**: 2026-06-23

## Artifacts Created

| Artifact       | Status     | File                                            |
| -------------- | ---------- | ----------------------------------------------- |
| Requirements   | ✅         | requirements.md                                 |
| System Context | ✅         | system-context.md                               |
| Units          | ✅         | units/001-dev-otp-bypass/unit-brief.md          |
| Stories        | ✅         | units/001-dev-otp-bypass/stories/\*.md (3)      |
| Bolt Plan      | ✅         | memory-bank/bolts/017-dev-otp-bypass            |

## Summary

| Metric                      | Count |
| --------------------------- | ----- |
| Functional Requirements     | 7     |
| Non-Functional Requirements | 4 groups (Security/Performance/Compatibility/Maintainability) |
| Units                       | 1     |
| Stories                     | 3     |
| Bolts Planned               | 1 (017) |

## Units Breakdown

| Unit | Stories | Bolts | Priority |
| ---- | ------- | ----- | -------- |
| 001-dev-otp-bypass | 3 | 1 (017) | Must |

## Decision Log

| Date       | Decision | Rationale | Approved |
| ---------- | -------- | --------- | -------- |
| 2026-06-23 | Activation via secret `X-Dev-Bypass` header on `/login` | Opt-in per request; harder to trigger by accident than auto-bypass | Yes (Checkpoint 1) |
| 2026-06-23 | Scope = all staff roles (DOED/Eval/Provincial) | Test every role without per-account config | Yes (Checkpoint 1) |
| 2026-06-23 | Hard-block bypass in production | Defense-in-depth footgun guard | Yes (Checkpoint 1) |
| 2026-06-23 | Production signal = `COOKIE_SECURE === true` | Reuse existing required env var; no new config | Proposed — pending Checkpoint 2 |

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
- [x] Human review complete (Checkpoint 3 approved 2026-06-23)

## Next Steps

1. Begin Construction Phase
2. Start with Unit: `001-dev-otp-bypass`, Bolt: `017-dev-otp-bypass`
3. Execute: `/specsmd-construction-agent --intent="006-dev-otp-bypass"`
