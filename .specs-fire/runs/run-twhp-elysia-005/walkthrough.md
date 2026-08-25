---
run: run-twhp-elysia-005
work_item: verdict-save-terminal-score
intent: score-change-finality
completed: 2026-08-24T04:07:02.075Z
---

# Walkthrough: Score change saves as a terminal verdict

## What changed

An evaluator's `change_score` no longer reads as a rejection at save time. It now writes
`recommended` — the same provisionally-settled status an `approve` writes — while keeping its
`verdictChoice` and `description`. Only a hard `reject` still writes `rejected`.

```ts
// before — change_score and reject were indistinguishable
entry.decision === "approve" ? "recommended" : "rejected"

// after — only a hard reject sends an Answer back
entry.decision === "reject" ? "rejected" : "recommended"
```

Because every downstream behaviour keys off that status, this one expression is what previously
sent a Cover back to `in_progress`, deleted the factory's evidence at finalize, and pushed the
factory into a negotiation loop whose `accept` branch has been returning 400 since ADR-0006.

## The evidence guard

With negotiation retired for score changes there is no later gate, so an evaluator may only name a
choice the Answer's existing files support. The rules are the ones `accept` already applied; they
now live in one place (`src/service/answerFileRules.ts`) used by both call sites.

Two deliberate departures from the work item as written, approved at the plan checkpoint:

- **The guard runs in both directions, not only on upgrades.** Under the cumulative rule a
  downgrade is always satisfied, but a `special === 3` question takes one file per choice — a 3→2
  downgrade needs `file_2_1`, which may not exist. An unsupportable correction should be a hard
  reject, not a settled score.
- **Standard-backed questions are exempt.** The standard, not an upload, is their evidence.

## Files

| File | Change |
|------|--------|
| `src/service/answerFileRules.ts` | **new** — `missingFileForChoice(choice, special, files)`, one definition of the per-choice evidence rules |
| `src/service/evaluator-review.ts` | three-way status map; evidence guard before the insert; `answerRow` query extended with `special`, `standard`, and three `fileUrl` columns |
| `src/service/answer.ts` | inline validator (`:818-839`) replaced by the shared helper — no behaviour change |
| `src/service/evaluator-review.save.integration.test.ts` | 19 → 26 tests; fixture now seeds evidence |

## Verification

`bun test` — **518 pass, 0 fail, 1 skip**. The save suite covers the new mapping, both guard
directions, the `special === 3` rule, the standard exemption, the tightened edit guard, and the
unchanged zero-side-effect contract.

`tsc --noEmit` reports 32 errors before and after this run — all pre-existing and unrelated
(Elysia handler typing, plus `evaluator-review.pastyear.test.ts` calling the verdict body with a
stale `outcome:` key).

## What this run deliberately did not do

Finalize is untouched. On `main` today a `recommended`-with-`verdictChoice` Answer would finalize
to `finished` **without its corrected score being applied**, because `accept` was the only code
path that ever wrote a Verdict Score into `answers.selectedChoice`.

That is closed by `finalize-settles-score`, the next work item. **These two must ship together** —
this one alone is not a deployable state.

## Open item carried forward

The standard-question exemption is broader here than in `accept`, which consults `enrolls` to check
the factory actually holds the standard. Recorded in `review-report.md` with the option to narrow
it; better decided in `finalize-settles-score`, where an unsupported choice would actually reach a
Grade.

---

## Amendment — 2026-08-24 (during run 006)

**The evidence guard described above was removed.** No file check runs on a `change_score` in
either direction, on any question type.

Refusing an unsupported upgrade left the evaluator only one alternative — a hard reject — which
deletes the factory's evidence and forces a redo. Honouring the verdict is the better outcome, and
the evaluator is the authority on what the evidence supports. Standard-backed questions already
behaved this way, so removing the guard made every question consistent and dissolved the
standard-exemption asymmetry recorded in `review-report.md` finding 1.

Kept: `src/service/answerFileRules.ts`, still the single definition used by `answer.ts` accept.
Reverted: the guard block, the extra columns in the `saveAnswerVerdict` query, and the import.
The four guard tests were re-pointed to assert the new rule rather than deleted; the suite still
runs 26 tests, 518 across the repo, 0 fail.
