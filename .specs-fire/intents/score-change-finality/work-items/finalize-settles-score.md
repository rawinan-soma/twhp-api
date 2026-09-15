---
id: finalize-settles-score
title: Finalize settles the verdict score and spares its evidence
intent: score-change-finality
complexity: high
mode: validate
status: completed
depends_on:
  - verdict-save-terminal-score
created: 2026-08-23T15:20:34Z
run_id: run-twhp-elysia-006
completed_at: 2026-08-24T07:54:49.591Z
---

# Work Item: Finalize settles the verdict score and spares its evidence

## Description

Rework `finalize` (`src/service/evaluator-review.ts:380-585`) so a score change is terminal: its
evidence survives, its corrected choice becomes the settled value the Grade computes from, and it
does not bounce the Cover to `in_progress`.

This is the item that carries the intent's risk. It writes to `answers.selectedChoice` — factory
data that ADR-0004 declared "never overwritten" — deletes fewer files than today, and must behave
correctly for production rows written under the old semantics without a migration.

The legacy-compatibility rule is load-bearing: classify a hard reject as
`status = 'rejected' AND verdictChoice IS NULL` rather than `status = 'rejected'`. Pre-existing
`rejected` + non-null `verdict_choice` rows then read as terminal score changes automatically,
keeping their evidence and settling their score at the next finalize.

## Acceptance Criteria

- [ ] The deletion set is exactly the Answers whose latest persisted log is `rejected` with a
      **null** `verdictChoice`; a score-changed Answer's `fileUrl1_1..fileUrl3_3` remain in MinIO
      and non-null in the DB after finalize.
- [ ] `newCoverStatus` derives from hard rejects only — a Cover whose only non-approve verdicts
      are score changes finalizes to `finished`.
- [ ] Inside the finalize transaction, each settled score change writes its `verdictChoice` into
      `answers.selectedChoice`, and its `recommended` row is promoted to `finished` like any other.
- [ ] The Grade computed at `:552-556` reflects the corrected choices.
- [ ] Legacy rows (`rejected` + non-null `verdict_choice`, written before this intent) are treated
      identically to a new score change — evidence kept, score settled, no bounce.
- [ ] A hard reject is unchanged end to end: files deleted via `deleteFileStrict` outside and
      before the transaction, URLs nulled, Cover → `in_progress`.
- [ ] The `in_review` hard gate (`:467-472`) is unchanged.
- [ ] A MinIO failure still aborts finalize before any DB write, with no partial transition.
- [ ] File I/O stays outside the transaction; the `selectedChoice` write is inside it.
- [ ] Integration coverage: score-change-only Cover → `finished` with correct Grade and intact
      files; mixed score-change + hard-reject Cover → `in_progress` with only the hard reject's
      files deleted; a legacy-shaped row exercised explicitly.
- [ ] `bun test` passes.

## Technical Notes

`accept` (`answer.ts:843-849`) is the only existing writer of a Verdict Score into
`selectedChoice`. Finalize adopts that write; the design doc should state plainly that ADR-0004's
"the factory's `selectedChoice` is never overwritten" no longer holds, and why the alternative
(overlaying `verdictChoice` at read time) was rejected — it would touch `score.ts`,
`scoreHelpers.ts`, and every Grade call site.

Open question for the design checkpoint: whether the pre-write `selectedChoice` value needs
preserving for audit. `answerLogs.verdict_choice` retains the corrected value and the log is
append-only, but the factory's original claim currently lives only in the column being overwritten.

## Dependencies

- verdict-save-terminal-score
