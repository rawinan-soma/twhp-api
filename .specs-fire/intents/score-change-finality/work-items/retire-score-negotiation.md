---
id: retire-score-negotiation
title: Retire the negotiation path for score changes
intent: score-change-finality
complexity: medium
mode: confirm
status: completed
depends_on:
  - finalize-settles-score
created: 2026-08-23T15:20:34Z
run_id: run-twhp-elysia-007
completed_at: 2026-08-24T08:05:36.832Z
---

# Work Item: Retire the negotiation path for score changes

## Description

Close the factory-side consensus loop for score changes, leaving it intact for hard rejects.

Once no score change lands in `rejected`, the `accept` branch of the negotiate endpoint
(`src/service/answer.ts:775-853`) is unreachable for new data — and it has been effectively broken
since ADR-0006 anyway, returning 400 against file URLs that finalize had already nulled.

Also correct the factory-facing read. `src/service/answer.ts:401-420` and
`src/routes/factories/assessments/index.ts:103-106` document and surface
"`status=rejected` ⇒ needs action; `verdictChoice` null on a hard reject, set on a score change" —
a distinction that no longer exists for new verdicts, and that must not present a settled score
change as an action item.

## Acceptance Criteria

- [ ] The `accept` action returns a clear 400 explaining that a score change is final and requires
      no factory response — or the branch is removed outright; the run decides and records which.
- [ ] `redo` / `object` on a hard-rejected Answer is unchanged.
- [ ] The factory assessment view no longer presents a score-changed Answer as needing action,
      for both new (`recommended` + `verdictChoice`) and legacy (`rejected` + `verdictChoice`)
      shapes.
- [ ] The corrected score and its description remain visible to the factory — finality must not
      mean invisibility.
- [ ] `verdictChoice` stays in the response contract at
      `src/routes/factories/assessments/index.ts:106`; only its meaning in the UI changes.
- [ ] Stale comments at `answer.ts:401` and `routes/factories/assessments/index.ts:103` are
      rewritten to match the new rule.
- [ ] `src/service/answer.integration.test.ts` updated — negotiation-accept tests re-expressed
      against the new contract rather than deleted.
- [ ] `bun test` passes.

## Technical Notes

Preserving `accept` as an explicit 400 is the safer choice while a frontend that still calls it
may be deployed. Confirm with the human whether the frontend has a live accept affordance before
choosing removal.

## Dependencies

- finalize-settles-score
