---
run: run-twhp-elysia-007
work_item: retire-score-negotiation
intent: score-change-finality
completed: 2026-08-24T08:05:36.832Z
---

# Walkthrough: Retire the negotiation path for score changes

## What changed

A settled score change now admits **no factory response at all** — not `accept`, not `redo`:

```ts
// Checked BEFORE the negotiable-state guard, because a settled correction rides on three
// different statuses: `recommended` pre-finalize, `finished` after, and `rejected` for rows
// written under the old semantics.
if (latestLog?.verdictChoice) {
  return status(400, { message: "this score is final and needs no response" });
}
```

Hard rejects are untouched: `redo` / `object` still work, and `accept` still answers
*"hard-rejected answer cannot be accepted; redo instead"*.

## The legacy rows were a live double-write

This guard is not merely tidying dead code. Before this run, a factory could still `accept` a
pre-existing `rejected` + `verdictChoice` row and write a settled score through `answer.ts` —
while `finalize` now claims sole ownership of that write. Two writers, one value, no coordination.
The guard closes it, and it is the reason the check keys on `verdictChoice` rather than on status.

## A gap run 006 left, fixed here

The factory-facing read returns the **latest** log's `status`, `verdictChoice` and `description`
(`answer.ts:400-424`). Run 006 carried `verdictChoice` forward on promotion but left
`description: null` — so the moment a Cover finished, the factory saw a downgraded score with **no
reason attached**. With negotiation retired that record is their only explanation.

`description` is now carried forward alongside `verdictChoice`, and the promotion-row test asserts
both survive finalize.

## Files

| File | Change |
|------|--------|
| `src/service/answer.ts` | finality guard; enrichment comment rewritten; explicit type on the retained `effectiveChoice` |
| `src/service/evaluator-review.ts` | promotion carries `description`; unused `settledScoreIds` removed |
| `src/routes/factories/assessments/index.ts` | response-schema comment rewritten |
| `src/service/answer.integration.test.ts` | 4 negotiation tests + settled-shape fixture |
| `src/service/evaluator-review.verdict.integration.test.ts` | promotion-row test extended |

## Verification

`bun test` — **528 pass, 0 fail, 1 skip**. `tsc --noEmit` — 32 errors, the unchanged baseline.

The negotiate endpoint had **no test coverage whatsoever** before this run. Four tests now pin the
contract across the new, legacy, and hard-reject shapes.

## Two things for the ADR

1. **The factory's right to contest a score is gone**, not merely its `accept` shortcut — `redo` on
   a settled correction is refused too. ADR-0004 chose the consensus loop specifically to preserve
   that right; the reversal should say so plainly.
2. **The `accept` branch body is retained but unreachable**, per the human's answer that a deployed
   frontend may still call it. Removing it awaits frontend confirmation.
