---
id: finalize-email-changed-answers
title: Finished-Cover email enumerates changed scores
intent: score-change-finality
complexity: medium
mode: confirm
status: completed
depends_on:
  - finalize-settles-score
created: 2026-08-23T15:20:34Z
run_id: run-twhp-elysia-008
completed_at: 2026-08-24T08:34:03.564Z
---

# Work Item: Finished-Cover email enumerates changed scores

## Description

With negotiation gone, the finished-Cover email is the first and only moment a factory learns its
score was corrected. Extend the `verdict-result-finished` job so it carries the changed Answers —
question, the factory's original choice, the settled choice, and the evaluator's description — and
render them in the mail.

`verdict-result-in-progress` is unchanged.

## Acceptance Criteria

- [ ] The `verdict-result-finished` payload (`evaluator-review.ts:571-577`) carries a list of
      changed Answers with question identity, original choice, settled choice, and description.
- [ ] The template in `src/worker/email.ts` renders the list, and omits the section entirely when
      no score was changed.
- [ ] Thai question text is used where the existing mails already do; presentation stays consistent
      with `verdict-result-finished` today.
- [ ] The `cc` behaviour at `:565-569` is unchanged.
- [ ] Enqueue failures are still swallowed and logged — a mail problem never fails a committed
      finalize.
- [ ] The original `selectedChoice` reaches the payload even though `finalize-settles-score`
      overwrites that column; capture it before the transaction.
- [ ] `bun test` passes.

## Technical Notes

Ordering matters: read the factory's original choices before the transaction that overwrites
`selectedChoice`, or the mail will report the corrected value twice.

## Dependencies

- finalize-settles-score
