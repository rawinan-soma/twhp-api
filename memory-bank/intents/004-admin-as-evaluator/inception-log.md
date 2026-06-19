---
intent: 004-admin-as-evaluator
created: 2026-06-19T00:00:00Z
completed: 2026-06-19T00:00:00Z
status: complete
---

# Inception Log: 004-admin-as-evaluator

## Overview

**Intent**: Grant the DOED admin ODPC-level powers (acting nationally) inside the existing
`003-evaluator-review` cover-review flow.
**Type**: brown-field (enhancement of intent 003)
**Created**: 2026-06-19

## Artifacts Created

| Artifact       | Status | File                                              |
| -------------- | ------ | ------------------------------------------------- |
| Requirements   | ✅     | requirements.md                                   |
| System Context | ✅     | system-context.md                                 |
| Units          | ✅     | units.md + units/001-admin-as-evaluator/unit-brief.md |
| Stories        | ✅     | units/001-admin-as-evaluator/stories/*.md (3)     |
| Bolt Plan      | ✅     | memory-bank/bolts/011..012-admin-as-evaluator/    |

## Summary

| Metric                      | Count |
| --------------------------- | ----- |
| Functional Requirements     | 8     |
| Non-Functional Requirements | 3 areas (Integrity, Maintainability, Scope) |
| Units                       | 1     |
| Stories                     | 3     |
| Bolts Planned               | 2     |

## Units Breakdown

| Unit                     | Stories | Bolts | Priority |
| ------------------------ | ------- | ----- | -------- |
| 001-admin-as-evaluator   | 3       | 2     | Must     |

## Decision Log

| Date | Decision | Rationale | Approved |
| ---- | -------- | --------- | -------- |
| 2026-06-19 | New intent `004` rather than folding into `003` | User framed it as a new feature; keeps 003's planned stories stable | Yes (PO) |
| 2026-06-19 | Region scope = **national/all** | Admins have no `region`; act as a national ODPC | Yes (PO, Checkpoint 1) |
| 2026-06-19 | Surface = **new `/admin/covers/*`** under `adminGuard` | Clean role separation; route injects ODPC context | Yes (PO, Checkpoint 1) |
| 2026-06-19 | Powers = **exactly equal to ODPC** (no superset) | No new review semantics; reuse ADR-0003/0004 | Yes (PO, Checkpoint 1) |
| 2026-06-19 | Audit = **no admin/ODPC distinction**, reuse non-FK `evaluation_id`/`evaluator_id` | Avoids schema/FK change | Yes (PO, Checkpoint 1) |
| 2026-06-19 | Reviewer-context seam (story 001) shared, not copy-pasted | Single ODPC code path; behaviour-preserving for evaluators | Yes (PO) |

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
- [x] Human review complete (Checkpoint 3 + 4 approved 2026-06-19)

## Next Steps

1. Construct **after** intent `003-evaluator-review` is implemented (hard dependency).
2. Start with bolt `011-admin-as-evaluator` (reviewer-context seam + admin answers).
3. Execute: `/specsmd-construction-agent --unit="001-admin-as-evaluator"`

## Dependencies

- **Cross-intent (hard)**: `003-evaluator-review/001-evaluator-review` must be implemented
  before bolt 011 (`requires_bolts: 010-evaluator-review`).
- Internal: 011 → 012.
