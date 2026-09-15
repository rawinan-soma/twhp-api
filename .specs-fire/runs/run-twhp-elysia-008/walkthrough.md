---
run: run-twhp-elysia-008
work_item: finalize-email-changed-answers
intent: score-change-finality
completed: 2026-08-24T08:34:03.564Z
---

# Walkthrough: Finished-Cover notification — no change required

## What changed in production code

**Nothing.** `src/worker/email.ts`, `src/queue/email.ts` and the `verdict-result-finished` payload
are byte-identical to before this run.

The work item was written assuming the finished email should enumerate corrected scores. The human
declined that on 2026-08-24: the email stays as it is. The notification channel is the UI, which
the email already directs the factory to
(*"กรุณาเข้าสู่ระบบเพื่อดูผลการประเมินและคะแนนอย่างละเอียด"*).

## What this run actually delivered

Proof that the read path carries the correction — which nothing tested.

`getAnswerByFactoryId` returns each answer's latest log, and after run 007 that row survives
finalize with both `verdictChoice` and `description`. The new test drives a **real** `finalize` and
then reads back through the factory's own service:

| Field | A corrected answer | An untouched approve |
|---|---|---|
| `status` | `finished` | `finished` |
| `verdictChoice` | `"1"` — the flag that it was corrected | `null` |
| `description` | the evaluator's reason | `null` |
| `selectedChoice` | `"1"` — the settled score | `"2"` — the factory's own |

This is the first coverage joining the evaluator and factory sides end to end. Run 007 asserted the
promotion row; nothing asserted what the factory reads once a Cover finishes.

## The consequence this run makes permanent

After finalize, the factory can see **which** answers were corrected and **why** — but not **what
it originally claimed**. `finalize-settles-score` overwrites `answers.selectedChoice` by design
(design decision 3), and the original is preserved nowhere: not in `answerLogs`, not in any column.

The declined email section would have been the last place that figure could appear. Recording it
here so the trade-off is visible rather than discovered later: restoring the original claim needs a
schema change and belongs to a separate intent.

## Verification

`bun test` — **530 pass, 0 fail, 1 skip**. `tsc --noEmit` — 32 errors, the unchanged baseline.
`git status src/worker/ src/queue/` — empty, confirming the email is untouched.

## Note for whoever adds tests to this file

The new `beforeAll` finalizes the shared fixture Cover, so this `describe` must stay last. A suite
added after it would see a `finished` Cover.
