---
run: run-twhp-elysia-006
work_item: finalize-settles-score
intent: score-change-finality
completed: 2026-08-24T07:54:49.591Z
---

# Walkthrough: Finalize settles the verdict score and spares its evidence

## What changed

`finalize` stopped asking *"is this Answer `rejected`?"* — a question that can no longer separate a
hard reject from a score correction — and started asking **"does its latest log carry a
`verdictChoice`?"**

```ts
// A settled score change: identified by its verdict, not its status.
const settledScores = open.filter((r) => r.verdictChoice !== null);

// A hard reject: `rejected` with no replacement proposed.
const hardRejectIds = new Set(
  open.filter((r) => r.status === "rejected" && r.verdictChoice === null).map((r) => r.answerId),
);
```

That single discriminator is why production needs no backfill. A score change reaches finalize in
two shapes — `recommended` (saved since run 005) and `rejected` (rows written under the old
semantics, still live) — and `verdictChoice` is the property both share. It is only ever written by
`change_score`, so a non-null value cannot mean anything else.

Everything else follows:

| Behaviour | Before | After |
|---|---|---|
| Files on a score change | deleted (ADR-0006) | preserved |
| Cover with score changes only | → `in_progress` | → `finished` |
| The corrected score | applied only if the factory accepted | applied by finalize |
| Grade input | factory's `selectedChoice` | settled choice |
| Promotion row's `verdictChoice` | nulled | carried forward |

The `selectedChoice := verdictChoice` write is the one `accept` used to perform in `answer.ts`,
moved to finalize now that the negotiation loop is retired for score changes.

## A regression I introduced and caught

Widening the promotion filter from `status === "recommended"` to "everything not hard-rejected"
quietly swept in Answers that a *previous* finalize had already promoted. A Cover that bounces to
`in_progress` and is finalized again would then append a duplicate `finished` log per Answer on
every pass, and re-apply the settled write each time.

The suite did not catch it — no test finalized the same Cover twice. Found by re-reading the diff.
Fixed with an `open` set (`status !== "finished"`) feeding classification, promotion, and settling,
and locked by a new re-finalize test. The `in_review` gate still reads the full set, since it must
see every Answer to refuse an incomplete finalize.

## Files

| File | Change |
|------|--------|
| `src/service/evaluator-review.ts` | `finalize`: classification, deletion set, promotions, settled write, cover status, Grade overlay |
| `src/service/evaluator-review.verdict.integration.test.ts` | 17 → 23 tests; the ADR-0006 case rewritten to assert preservation |

## Verification

`bun test` — **524 pass, 0 fail, 1 skip**. `tsc --noEmit` — 32 errors before and after, all
pre-existing.

New coverage: one-pass finish, promotion-row retention, Grade correction, legacy-row settlement,
mixed hard-reject Cover, re-finalize idempotence.

(An earlier run reported 16 failures — OrbStack had stopped, taking Postgres and Redis with it.
Environment only; restarted and green.)

## State after this run

**The behavioural fix is complete and deployable.** An evaluator's score correction is now terminal
end to end: it saves as `recommended`, keeps the factory's evidence, settles the score at finalize,
moves the Grade, and closes the Cover in one pass. Existing production rows are handled on their
next finalize with no migration.

What remains is presentation and record-keeping:

- `retire-score-negotiation` — the factory's `accept` path is now dead code
- `finalize-email-changed-answers` — the factory still isn't told what changed
- `standard-file-deletion-on-hard-reject` — added mid-intent at the human's request
- `adr-and-context-reconciliation` — ADR-0004/0006 and `CONTEXT.md` still describe the old loop
