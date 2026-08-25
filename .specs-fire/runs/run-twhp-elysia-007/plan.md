---
run: run-twhp-elysia-007
work_item: retire-score-negotiation
intent: score-change-finality
mode: confirm
checkpoint: plan
approved_at: null
---

# Implementation Plan: Retire the negotiation path for score changes

## Approach

Three changes, all about what the *factory* sees and may do.

1. **Refuse `accept` on any score change** — new or legacy. The branch stays (the frontend may
   still call it) but returns a message saying the verdict is final, instead of quietly re-applying
   a score finalize already owns.
2. **Carry `description` forward on promotion**, alongside `verdictChoice`. Without this the reason
   for a correction disappears the moment the Cover finishes.
3. **Correct the stale comments** at `answer.ts:401-402` and
   `routes/factories/assessments/index.ts:103-104`, which still tell the reader that
   `status="rejected"` means "needs action" and that a set `verdictChoice` means a *proposal*.

## The description gap

Found while reading the factory-facing enrichment (`answer.ts:400-424`): it returns the **latest**
log's `status`, `verdictChoice` and `description`. Run 006 made the finalize promotion carry
`verdictChoice` forward but left `description: null` — so after a Cover finishes, the factory sees
the corrected score with **no reason attached**.

That directly contradicts this work item's criterion that the correction stays visible. Fixing it
is a one-word change to the promotion row, made here rather than deferred.

## Files to Modify

| File | Changes |
|------|---------|
| `src/service/answer.ts` | `negotiate`: refuse `accept` when the latest log carries a `verdictChoice`; rewrite the stale enrichment comment |
| `src/service/evaluator-review.ts` | promotion rows carry `description` forward as well as `verdictChoice` |
| `src/routes/factories/assessments/index.ts` | rewrite the response-schema comment to the new rule |
| `src/service/answer.integration.test.ts` | negotiation-accept tests re-expressed against the new contract |
| `src/service/evaluator-review.verdict.integration.test.ts` | assert the promotion row retains the description |

## Tests

| Test File | Coverage |
|-----------|----------|
| `answer.integration.test.ts` | `accept` on a score change (both `recommended` and legacy `rejected` shapes) → 400 naming finality; `accept` on a hard reject → the existing 400; `redo`/`object` on a hard reject unchanged; a settled score change is not presented as actionable |
| `evaluator-review.verdict.integration.test.ts` | the `finished` promotion row retains both `verdictChoice` and `description` |

## What stays

The `accept` branch's body — file revalidation, the standard-question forcing, the
`selectedChoice` write — is left intact behind the new guard. It is unreachable for score changes
but remains the reference for how a Verdict Score was applied, and deleting it is a separate call
once the frontend is confirmed (recorded for the ADR).

`redo` / `object` on hard rejects is untouched: that loop is still the intended path.

---
*Plan approved at checkpoint. Execution follows.*
