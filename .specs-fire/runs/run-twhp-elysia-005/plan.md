---
run: run-twhp-elysia-005
work_item: verdict-save-terminal-score
intent: score-change-finality
mode: confirm
checkpoint: plan
approved_at: null
---

# Implementation Plan: Score change saves as a terminal verdict

## Approach

Two changes in `saveAnswerVerdict` (`src/service/evaluator-review.ts:289-378`), plus test
reconciliation:

1. **Three-way status map.** Replace the binary at `:367-369` so `change_score` writes
   `recommended` (retaining `verdictChoice` + `description`) and only `reject` writes `rejected`.
2. **Evidence guard.** Before writing, verify the target choice's required files exist on the
   Answer, reusing the rules `accept` applies today (`src/service/answer.ts:818-839`). Refuse with
   400 naming the missing file.
3. **Tests** — correct the assertions that encode the old mapping, seed file URLs in the fixture,
   add guard coverage.

`saveAnswerVerdict`'s zero-side-effect contract holds: no MinIO I/O, no `coverLogs`, no email.

## Files to Modify

| File | Changes |
|------|---------|
| `src/service/evaluator-review.ts` | Three-way status map at `:367-369`; extend the `answerRow` query (`:310-322`) to select the nine `fileUrl*` columns plus `questions.special` and `questions.standard`; add the evidence guard before the insert |
| `src/service/answer.ts` | Extract the inline file-requirement rules at `:818-839` into an exported helper so both call sites share one definition — no behaviour change here |
| `src/service/evaluator-review.save.integration.test.ts` | Correct two assertions (`:294`, `:437`); seed `fileUrl*` on fixture answers; add guard tests |

## Tests

| Test File | Coverage |
|-----------|----------|
| `src/service/evaluator-review.save.integration.test.ts` | `change_score` → `recommended` with `verdictChoice`/`description` retained; `reject` → `rejected` + null `verdictChoice`; `approve` unchanged; no-op guard still 400; evidence guard fires on an unsupported target choice; guard passes when files exist; `special === 3` single-file rule; standard-question exemption; `recommended` edit guard now governs a saved score change (author/ODPC 200, other tier-1 403) |

## Two corrections to the work item

**1. "A downgrade never triggers the evidence guard" is wrong for `special === 3` questions.**

Under the cumulative rule (choice 3 ⇒ `1_1`+`2_1`+`3_1`) a downgrade is always satisfied, so the
criterion holds. But `special === 3` uses a single-file-per-choice rule — choice 3 requires only
`file_3_1`. A 3→2 downgrade then needs `file_2_1`, which may not exist.

*Recommendation*: validate the **target** choice unconditionally, mirroring `accept`. A special
question with no evidence for the target choice is genuinely unsupportable in either direction, and
with negotiation gone there is no later gate to catch it — the auditor should hard-reject instead.
This makes the guard direction-agnostic, and the work item's criterion is amended to say so.

**2. Standard questions must be exempt.**

`accept` returns early for a standard question whose factory holds a matching standard
(`answer.ts:805-815`), forcing choice `"3"` without touching files — the standard *is* the evidence.
Validating files there would refuse legitimate verdicts.

*Recommendation*: skip the guard whenever `questions.standard.length > 0`. Cheaper and safer than
re-deriving `standardBoolMap` from `enrolls` inside the verdict path, and a standard question's
score is governed by the standard rather than uploads either way.

## Technical Details

**Fixture gap.** The save test seeds answers with no `fileUrl*` values at all. Adding the guard
without touching the fixture would break the existing test at `:437` — it issues
`change_score → "3"` on a file-less answer and expects 200. The fixture must seed files; the tests
were written before file state mattered to this path.

**Choice `"n/a"`.** `verdictChoice` is constrained to `0–3` by the schema, so the guard never
receives `n/a` as a target. A factory `selectedChoice` of `n/a` is only relevant to the existing
no-op check, which is unchanged.

**Helper extraction.** Work item `retire-score-negotiation` may delete `accept` entirely; the
helper then serves `evaluator-review.ts` alone. Extracting now still avoids two divergent copies of
the rule during the intervening runs.

**Not in this run**: finalize behaviour, `selectedChoice` writes, file deletion, Cover status —
all belong to `finalize-settles-score`. This run leaves finalize untouched, so on `main` a
`recommended`-with-`verdictChoice` Answer would finalize to `finished` **without** its score being
applied. That is expected mid-intent and closed by the next work item; the two should ship together.

---
*Plan approved at checkpoint. Execution follows.*
