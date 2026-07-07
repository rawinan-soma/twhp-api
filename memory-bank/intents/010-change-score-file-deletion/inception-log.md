---
intent: 010-change-score-file-deletion
created: 2026-07-07T00:00:00.000Z
completed: 2026-07-07T00:00:00.000Z
status: complete
---

# Inception Log: 010-change-score-file-deletion

## Overview

**Intent**: Delete evidence files at finalize for `change_score` verdicts, same as hard rejects — reverses one clause of ADR-0005 / intent `008` FR-6.
**Type**: brown-field (enhancement, defect-adjacent business-rule reversal)
**Created**: 2026-07-07

## Artifacts Created

| Artifact       | Status | File                             |
| -------------- | ------ | -------------------------------- |
| Requirements   | ✅     | requirements.md                  |
| System Context | ✅     | system-context.md                |
| Units          | ✅     | units/001-change-score-file-deletion/unit-brief.md |
| Stories        | ✅     | units/001-change-score-file-deletion/stories/\*.md (2 files) |
| Bolt Plan      | ✅     | memory-bank/bolts/023-change-score-file-deletion/bolt.md |

## Summary

| Metric                      | Count |
| ---------------------------- | ----- |
| Functional Requirements      | 3     |
| Non-Functional Requirements  | 2     |
| Units                        | 1     |
| Stories                      | 2     |
| Bolts Planned                | 1     |

## Units Breakdown

| Unit                            | Stories | Bolts | Priority |
| -------------------------------- | ------- | ----- | -------- |
| 001-change-score-file-deletion  | 2       | 1     | Must     |

## Decision Log

| Date       | Decision                                                             | Rationale                                                                                     | Approved |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| 2026-07-07 | Keep file deletion deferred to `finalize`; widen predicate, don't move it to `saveAnswerVerdict` | Preserves existing file-I/O-outside-txn pattern and the "save has zero MinIO I/O" invariant from ADR-0005 | Yes      |
| 2026-07-07 | Draft a new ADR-0006 superseding ADR-0005's file-preservation clause  | The clause being reversed is an explicit, named, Must-priority decision — needs a paper trail   | Yes      |

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
- [x] Human review complete

## Next Steps

1. Begin Construction Phase
2. Start with Unit: 001-change-score-file-deletion
3. Execute: `/specsmd-construction-agent --unit="001-change-score-file-deletion" --bolt-id="023-change-score-file-deletion"`

## Dependencies

Depends on `008-per-answer-verdict-save` (must be construction-complete; it is — bolts 019-021 shipped).
