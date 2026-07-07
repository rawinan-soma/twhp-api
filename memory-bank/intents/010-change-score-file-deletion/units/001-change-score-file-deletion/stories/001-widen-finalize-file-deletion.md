---
id: 001-widen-finalize-file-deletion
unit: 001-change-score-file-deletion
intent: 010-change-score-file-deletion
status: complete
priority: must
created: 2026-07-07T00:00:00.000Z
assigned_bolt: 023-change-score-file-deletion
implemented: true
---

# Story: 001-widen-finalize-file-deletion

## User Story

**As an** ODPC evaluator running `finalize`
**I want** a `change_score` verdict's evidence file deleted along with hard-reject files
**So that** a factory can't redo a downgraded Answer by resubmitting the same file that was already judged insufficient

## Acceptance Criteria

- [ ] **Given** an Answer whose latest persisted `answerLogs` row is `change_score` (`status: rejected`, `verdictChoice` set), **When** `finalize` commits, **Then** its `fileUrl1_1..fileUrl3_3` columns are nulled and the corresponding MinIO objects are deleted.
- [ ] **Given** an Answer whose latest persisted row is a hard `reject` (`status: rejected`, `verdictChoice` null), **When** `finalize` commits, **Then** its files are deleted — unchanged from current behavior.
- [ ] **Given** an Answer whose latest persisted row is `recommended` or `finished`, **When** `finalize` commits, **Then** its files are left untouched.
- [ ] **Given** an Answer was `change_score`'d and then re-saved to `approve` before finalize runs, **When** `finalize` reads the latest log, **Then** the file is preserved (the fix must not special-case this — it should fall out naturally from reading only the latest log per Answer).
- [ ] **Given** a MinIO deletion fails for any file in the widened set, **When** `finalize` runs, **Then** it returns `500` and aborts before any DB write (existing pre-transaction pattern, unchanged).

## Technical Notes

- Change is in `src/service/evaluator-review.ts`, inside `finalize`: the `hardRejectIds` computation currently filters `r.status === "rejected" && r.verdictChoice === null`. Drop the `verdictChoice === null` clause.
- Rename `hardRejectIds` (and its comment) to something that no longer implies "hard-reject only" — e.g. `rejectedAnswerIds` — since it now includes change_score outcomes too. Update the adjacent comment referencing "(change_score/overridden files carry a verdictChoice and are preserved.)" to reflect the new rule.
- No change to `saveAnswerVerdict` — it must remain zero-MinIO-I/O.

## Dependencies

### Requires

- None (first story in this unit)

### Enables

- 002-regression-coverstatus-and-surface-parity

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Answer has multiple change_score saves before finalize (evaluator changed the suggested score twice) | Only the latest log row matters; files deleted once, based on final state |
| Answer's file was already null (factory never uploaded, e.g. optional file) | No-op delete for that column; no error |
| Cover has a mix of hard-reject and change_score Answers | Both sets' files deleted in the same finalize call |

## Out of Scope

- Any change to `coverStatus`/grade resolution (covered by story 002 as a regression check, not a new behavior).
- Any change to the admin vs evaluator route wiring (shared `finalize` implementation, no branching needed).
