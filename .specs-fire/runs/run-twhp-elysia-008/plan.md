---
run: run-twhp-elysia-008
work_item: finalize-email-changed-answers
intent: score-change-finality
mode: confirm
checkpoint: plan
approved_at: null
revision: 2
---

# Implementation Plan (rev 2): Finished-Cover notification

**Revision 1 proposed adding a changed-scores section to the finished email. The human declined on
2026-08-24: the email stays exactly as it is.**

## Approach

The email is not the channel. The factory already logs in to see results — the existing mail says
so (*"กรุณาเข้าสู่ระบบเพื่อดูผลการประเมินและคะแนนอย่างละเอียด"*), and the read path already carries
everything needed:

`getAnswerByFactoryId` (`answer.ts:400-424`) returns each answer's latest log — `status`,
`verdictChoice`, `description`. After run 007 those survive finalize on the promotion row, so a
corrected answer arrives as `finished` + `verdictChoice` + the evaluator's reason.

So this run **writes no production code**. What it does is prove the claim, because nothing
currently tests the factory's view *after* a finalize — run 007 asserted the promotion row, not
what the factory reads back.

1. **No change** to `src/worker/email.ts` or the `verdict-result-finished` payload.
2. **Add end-to-end coverage** that a factory reading its own assessment after finalize can see
   which answers were corrected and why.
3. **Record the decision** so the next reader does not re-propose the email section.

## Files to Modify

| File | Changes |
|------|---------|
| `src/service/answer.integration.test.ts` | end-to-end: finalize a Cover with a correction, then assert the factory read surfaces it |
| (none in `src/worker/email.ts`) | deliberately unchanged |
| (none in `src/service/evaluator-review.ts`) | deliberately unchanged |

## Tests

| Test File | Coverage |
|-----------|----------|
| `answer.integration.test.ts` | after finalize, a corrected answer reads back as `status: finished`, `verdictChoice` set to the settled score, `description` carrying the reason; an untouched approve reads back with `verdictChoice: null`, so the two are distinguishable in the UI |

## One consequence to state plainly

After finalize, `answers.selectedChoice` **is** the corrected value — `finalize-settles-score`
overwrites it by design (design doc decision 3). So the factory sees:

| Field | Value |
|-------|-------|
| `selectedChoice` | `1` — the settled score |
| `verdictChoice` | `1` — marks it as corrected, not self-reported |
| `description` | the evaluator's reason |

The factory can therefore tell **which** answers were corrected and **why**, but not **what they
originally claimed** — that value is overwritten and preserved nowhere. This was accepted at the
design checkpoint (the old `accept` path already overwrote it), and it is the reason the email
section would have been the only place the original figure could still appear.

If the original claim matters to the factory or to an audit, it needs a schema change and belongs
in a separate intent. Flagged, not assumed.

## Work item disposition

`finalize-email-changed-answers` is completed as **no change required** — the notification need is
met by the existing read path. The ADR records the decision and its consequence.

---
*Plan approved at checkpoint. Execution follows.*
