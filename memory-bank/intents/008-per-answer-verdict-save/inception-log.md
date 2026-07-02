---
intent: 008-per-answer-verdict-save
created: 2026-07-02T00:00:00Z
completed: 2026-07-02T00:00:00Z
status: complete
---

# Inception Log: per-answer-verdict-save

## Overview

**Intent**: Replace the single-batch evaluator verdict with per-Answer save + a separate atomic ODPC finalize, so review work is durable and resumable — preserving every ADR-0003/0004 domain rule.
**Type**: brown-field (enhancement of `003-evaluator-review`)
**Created**: 2026-07-02

## Artifacts Created

| Artifact       | Status | File                            |
| -------------- | ------ | ------------------------------- |
| Requirements   | ✅     | requirements.md                 |
| System Context | ✅     | system-context.md               |
| Units          | ✅     | units/001-per-answer-verdict-save/unit-brief.md |
| Stories        | ✅     | units/001-per-answer-verdict-save/stories/*.md (7) |
| Bolt Plan      | ✅     | memory-bank/bolts/019..021-per-answer-verdict-save/bolt.md (3) |

## Summary

| Metric                      | Count |
| --------------------------- | ----- |
| Functional Requirements     | 9     |
| Non-Functional Requirements | 3 groups (durability/resumability, integrity/concurrency, auditability) |
| Units                       | 1 (`001-per-answer-verdict-save`) |
| Stories                     | 7     |
| Bolts Planned               | 3 (`019`–`021`) |

## Decision Log

| Date | Decision | Rationale | Approved |
| ---- | -------- | --------- | -------- |
| 2026-07-02 | Two-phase model: per-Answer save + separate ODPC finalize | Durability + resume; grilling session + ADR-0005 | Yes |
| 2026-07-02 | Save = verdict, no draft state | Drivers served without a 5th enum value; `recommended` already provisional | Yes |
| 2026-07-02 | Only finalize writes `finished` (even ODPC approve → `recommended`) | Keeps ODPC saves revocable; strengthens ADR-0004 to a code-level guarantee | Yes |
| 2026-07-02 | Hard-reject file deletion deferred to finalize | Reject is revocable until commit; deleting on save destroys evidence | Yes |
| 2026-07-02 | Finalize hard-gates on any `in_review` | Preserves "every terminal verdict explicitly authored" (eval_id) | Yes |
| 2026-07-02 | Edit guard keyed off authorship (`eval_id`), not blanket non-ODPC | Fixes code guard vs CONTEXT; protects Factory-accepted recommendations | Yes |
| 2026-07-02 | Drop `VerdictBatchSchema` + batch endpoint; both surfaces get save+finalize | Batch retired; admin-as-ODPC mirrors evaluators | Yes |

## Scope Changes

| Date | Change | Reason | Impact |
| ---- | ------ | ------ | ------ |
| 2026-07-02 | Admin force-status/override endpoint excluded | ADR-0004 defers escalation/override to a future ADR | Out of scope |
| 2026-07-02 | "Un-verdict" (revert to `in_review`) excluded | Re-saving a different decision covers it (FR-3) | Out of scope |

## Ready for Construction

**Checklist**:

- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete

## Next Steps

1. Begin Construction Phase
2. Start with Unit: `001-per-answer-verdict-save`, bolt `019-per-answer-verdict-save`
3. Execute: `/specsmd-construction-agent --unit="001-per-answer-verdict-save"`

## Dependencies

Brown-field on `003-evaluator-review` (unit `001-evaluator-review`, bolts `006`–`010`). No schema change. Coordinates with the in-flight `admins/covers` route migration.
