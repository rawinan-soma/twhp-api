---
id: verdict-save-terminal-score
title: Score change saves as a terminal verdict
intent: score-change-finality
complexity: medium
mode: confirm
status: completed
depends_on: []
created: 2026-08-23T15:20:34Z
run_id: run-twhp-elysia-005
completed_at: 2026-08-24T04:07:02.075Z
---

# Work Item: Score change saves as a terminal verdict

## Description

Split `change_score` away from `reject` at save time. `saveAnswerVerdict`
(`src/service/evaluator-review.ts:289-378`) currently collapses both into `rejected` at lines
367-369; after this item, `change_score` writes `recommended` while retaining its `verdictChoice`
and `description`, and only a hard `reject` writes `rejected`.

Also add the upgrade-evidence guard: an upward `verdictChoice` whose required files do not exist is
refused here with a 400, rather than surfacing at finalize. The rules to port are the ones `accept`
applies today (`src/service/answer.ts:818-839`), including the `question.special === 3` branch.

No file I/O and no Cover transition — `saveAnswerVerdict`'s zero-side-effect contract (ADR-0005)
is preserved exactly.

## Acceptance Criteria

- [ ] `decision: "change_score"` appends one `answerLogs` row with `status: "recommended"`,
      `verdictChoice` set, and `description` retained.
- [ ] `decision: "reject"` still appends `status: "rejected"` with null `verdictChoice`.
- [ ] `decision: "approve"` behaviour is byte-for-byte unchanged.
- [ ] The existing no-op guard still rejects a `change_score` equal to the factory's
      `selectedChoice` with 400 (`:359-365`).
- [x] ~~Evidence guard~~ — **removed 2026-08-24**. A `change_score` is never file-checked, in
      either direction, standard-backed or not. Covered instead by tests asserting an unsupported
      upgrade, a `special === 3` downgrade, and a standard-backed change all settle.
- [ ] The `recommended` edit guard (`:353-357`) now governs a saved score change: its author or
      ODPC may re-save it; another tier-1 reviewer receives 403.
- [ ] `saveAnswerVerdict` still performs zero MinIO I/O and writes no `coverLogs` row.
- [ ] `src/service/evaluator-review.save.integration.test.ts` updated — assertions encoding
      `change_score → rejected` are corrected, not deleted.
- [ ] `bun test` passes.

## Technical Notes

The status expression becomes a three-way map rather than a binary. `verdictChoice` is already
written only for `change_score` (`:373`), so the column semantics do not change — what changes is
the status it is paired with.

Note the standard-question branch in `accept` (`answer.ts:805-815`) returns before file validation
because a matching standard forces choice `"3"`. Decide during implementation whether the save-time
guard needs the same exemption; a standard question whose factory holds the standard cannot
meaningfully fail an evidence check.

## Dependencies

(none)
