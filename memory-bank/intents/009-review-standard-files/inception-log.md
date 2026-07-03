---
intent: 009-review-standard-files
created: 2026-07-03T01:54:42Z
completed: 2026-07-03T02:26:30Z
status: complete
---

# Inception Log: review-standard-files

## Overview

**Intent**: Surface the factory's declared standard certificate files (claimed + uploaded) inside the cover-review `/answers` response for tier-1 evaluators, ODPC, and DOED admins — view-only, no schema change.
**Type**: brown-field (enhancement of 003-evaluator-review / 008-per-answer-verdict-save)
**Created**: 2026-07-03

## Artifacts Created

| Artifact       | Status | File                            |
| -------------- | ------ | ------------------------------- |
| Requirements   | ✅ (approved Checkpoint 2) | requirements.md                 |
| System Context | ✅     | system-context.md               |
| Units          | ✅     | units.md + units/001-review-standard-files/unit-brief.md |
| Stories        | ✅     | units/001-review-standard-files/stories/001..004.md |
| Bolt Plan      | ✅     | memory-bank/bolts/022-review-standard-files/bolt.md |

## Summary

| Metric                      | Count |
| --------------------------- | ----- |
| Functional Requirements     | 4     |
| Non-Functional Requirements | 3 groups |
| Units                       | 1     |
| Stories                     | 4     |
| Bolts Planned               | 1 (022) |

## Decision Log

| Date | Decision | Rationale | Approved |
| ---- | -------- | --------- | -------- |
| 2026-07-03 | "Standard file" = the 11 enrollment standard certificates (`fileStandard*Url`), plus a per-standard has-status | Checkpoint-1 clarification; per-answer evidence files are already shown in the review step | Yes |
| 2026-07-03 | Surface via the existing `/answers` response (shape → `{ answers, standards }`) rather than a new endpoint | Checkpoint-1 clarification: reviewer wants it in the same cover-review call | Yes |
| 2026-07-03 | Include only claimed + uploaded standards | Checkpoint-1 clarification | Yes |
| 2026-07-03 | Item shape `{ standard, fileName }` — drop redundant `hasStandard` | Enroll create+update enforce claimed⟹file (enroll.ts:220,452), so a claimed standard always has a file; the flag would always be true | Yes |
| 2026-07-03 | Return the `standardTypes` enum key, not a display label | No server-side standard label map; API exposes enum keys elsewhere; frontend maps Thai/EN | Yes |
| 2026-07-03 | Return raw `fileName`, resolved via existing `/file/presigned-url` | Matches per-answer evidence-file convention (AnswerViewItem) | Yes |

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
- [x] Human review complete (Checkpoint 3 approved 2026-07-03)

## Next Steps

1. Approve requirements (Checkpoint 2)
2. Generate System Context + Units + Stories + Bolt Plan
3. Review artifacts (Checkpoint 3) → Construction

## Dependencies

Depends on the cover-review read path delivered by `008-per-answer-verdict-save` (bolt 021) — the `evaluators`/`admins` `covers/:coverId/answers` routes and `evaluatorReviewService.getAnswers`.
