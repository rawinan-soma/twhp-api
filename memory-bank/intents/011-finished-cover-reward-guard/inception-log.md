---
intent: 011-finished-cover-reward-guard
created: 2026-07-20T03:57:33Z
completed: 2026-07-20T04:12:29Z
status: complete
---

# Inception Log: 011-finished-cover-reward-guard

## Overview

**Intent**: Return a Grade reward only when the Cover's latest `CoverLog` status is `finished`, while
preserving every other score, endpoint, and workflow behavior.
**Type**: defect-fix
**Created**: 2026-07-20

## Artifacts Created

| Artifact | Status | File |
|----------|--------|------|
| Requirements | Complete | requirements.md |
| System Context | Complete | system-context.md |
| Units | Complete | units/001-finished-cover-reward-guard/unit-brief.md |
| Stories | Ready | units/001-finished-cover-reward-guard/stories/*.md (3 files) |
| Bolt Plan | Planned | memory-bank/bolts/024-finished-cover-reward-guard/bolt.md |

## Summary

| Metric | Count |
|--------|-------|
| Functional Requirements | 5 |
| Non-Functional Requirements | 2 |
| Units | 1 |
| Stories | 3 |
| Bolts Planned | 1 |

## Units Breakdown

| Unit | Stories | Bolts | Priority |
|------|---------|-------|----------|
| 001-finished-cover-reward-guard | 3 | 1 | Must |

## Decision Log

| Date | Decision | Rationale | Approved |
|------|----------|-----------|----------|
| 2026-07-20 | Scope “reward” to Grade only | Product Owner requires numerical scores and endpoints to remain unchanged | Yes |
| 2026-07-20 | Gate Grade by latest `CoverLog.status = finished` | Matches the requested reward-release rule and current latest-log-wins model | Yes |
| 2026-07-20 | Exclude Cover completeness/finalization integrity | Product Owner explicitly limited the intent to Grade return behavior | Yes |
| 2026-07-20 | Use “the Factory's Cover is finished” terminology | `finished` is a CoverLog state, not a Factory account state | Yes |

## Scope Changes

| Date | Change | Reason | Impact |
|------|--------|--------|--------|

## Ready for Construction

**Checklist**:

- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete

## Next Steps

1. Begin Construction Phase.
2. Start with Unit: `001-finished-cover-reward-guard`.
3. Execute: `/specsmd-construction-agent --intent="011-finished-cover-reward-guard" --unit="001-finished-cover-reward-guard" --bolt-id="024-finished-cover-reward-guard"`.

## Dependencies

Builds on `001-score-calculator-and-report` and `008-per-answer-verdict-save`. No database schema
dependency is expected.
