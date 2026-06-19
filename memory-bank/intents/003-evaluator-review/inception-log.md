---
intent: 003-evaluator-review
created: 2026-06-16T00:00:00Z
completed: 2026-06-17T00:00:00Z
status: complete
---

# Inception Log: evaluator-review

## Overview

**Intent**: Hierarchical, ODPC-gated review of factory assessment Covers — tier-1 (Mental/DOH) reviewers plus ODPC as sole finalizer, with grading, file cleanup on reject, and a finalize-time notification email.
**Type**: green-field (new feature)
**Created**: 2026-06-16

## Artifacts Created

| Artifact       | Status | File                            |
| -------------- | ------ | ------------------------------- |
| Requirements   | ✅     | requirements.md                 |
| System Context | ✅     | system-context.md               |
| Units          | ✅     | units/001-evaluator-review/unit-brief.md |
| Stories        | ✅     | units/001-evaluator-review/stories/*.md (10) |
| Bolt Plan      | ✅     | memory-bank/bolts/006..010-evaluator-review/bolt.md (5) |

## Summary

| Metric                      | Count |
| --------------------------- | ----- |
| Functional Requirements     | 10    |
| Non-Functional Requirements | 3 groups (integrity/concurrency, auditability, scope) |
| Units                       | 1 (`001-evaluator-review`) |
| Stories                     | 10   |
| Bolts Planned               | 5 (`006`–`010`) |

## Decision Log

| Date | Decision | Rationale | Approved |
| ---- | -------- | --------- | -------- |
| 2026-06-16 | Category map: DOH→Disease,Safety · Mental→Mental · ODPC→Collaborate,Outcome+override | PO decision (CONTEXT.md) | Yes |
| 2026-06-17 | Three verdict outcomes: approve / change-score / reject (grilling) | Evaluators need to correct scores, not just approve/reject | Yes |
| 2026-06-17 | Verdict Score = new `answerLogs.verdict_choice` (0–3); factory choice preserved; live=latest accepted | Provenance + "Score never persisted" intact (ADR-0004) | Yes |
| 2026-06-17 | change-score & reject reuse `rejected` status, distinguished by `verdict_choice`; description mandatory for both | Avoid enum/blast-radius change | Yes |
| 2026-06-17 | Unbounded negotiation loop; ODPC controls transition but cannot force a score value | PO: factory may object indefinitely (ADR-0004) | Yes |
| 2026-06-17 | ODPC full override of non-`finished` tier-1 verdicts; `finished` immutable to everyone | PO decision (grilling) | Yes |
| 2026-06-17 | change-score preserves files; hard-reject deletes at ODPC commit (outside txn) | Factory needs files to object | Yes |
| 2026-06-17 | Grade = 4 tiers (gold/silver/certificate/joined), top-down overall floors, on `finished` only | Bands left ungraded holes (grilling) | Yes |
| 2026-06-17 | Email on **every** ODPC commit (finished "+grade" / in_progress "revision") | Factory must know when results return | Yes |
| 2026-06-17 | Verdict out-of-scope guard → whole batch `403` (fail-loud) | Consistent with single-transaction rule | Yes |
| 2026-06-17 | Gap 1: add `recommended` answerStatus; only ODPC writes `finished`; tier-1 approve + factory-accept → `recommended` | Resolve "tier-1 non-finalizing" vs "approve→finished" vs "finished immutable" contradiction | Yes |
| 2026-06-17 | Gap 2: add `grade` to Score Report + list endpoints (null unless finished) | Grade had no post-finalize retrieval path | Yes |
| 2026-06-17 | Gap C: factory-accept re-uses normal per-choice file validator | Prevent evidence-less upward score on accept | Yes |
| 2026-06-17 | Gap D: every region always has an ODPC assigned (invariant, not runtime guard) | Sole-finalizer would otherwise deadlock | Yes |

## Scope Changes

| Date | Change | Reason | Impact |
| ---- | ------ | ------ | ------ |
| 2026-06-17 | Binary approve/reject → three-outcome verdict-score model with unbounded negotiation loop | Grilling session w/ PO (ADR-0004) | +1 schema column, new factory accept/object/redo flow, FR count 8→10 |
| 2026-06-17 | Grade 3 tiers → 4 tiers (added `joined`), bands → top-down floors | Closed ungraded-region holes | Grading logic revised |
| 2026-06-17 | Email finished-only → every ODPC commit | PO decision | +1 email template/job variant; wider email-worker surface (ADR-0002) |
| 2026-06-17 | Add 4th `answerStatus` `recommended` (Gap 1) | "tier-1 non-finalizing" needed a representable overridable-approval state | Schema enum +1 value; audit all answerStatus switches |
| 2026-06-17 | `grade` added to Score Report / list endpoints (Gap 2) | Post-finalize retrieval path | Score Report schema + list endpoints |

## Ready for Construction

**Checklist**:

- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete — **approved 2026-06-17 (Checkpoint 3 & 4)**

## Next Steps

1. Begin Construction Phase
2. Start with Unit: `001-evaluator-review`, Bolt: `006-evaluator-review` (schema + level access foundation)
3. Execute: `/specsmd-construction-agent --unit="001-evaluator-review"` (bolt order `006 → 007 → 008 → 009/010`)

## Dependencies

- Reuses existing factory score endpoint (intent `001-score-calculator-and-report`) as the final-score report — no new score work.
- Depends on the existing BullMQ `email` queue/worker (shared with `002-staff-2fa` OTP job).
