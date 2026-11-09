---
name: review-flow
description: TLA+ model of the Cover/Answer review flow in twhp-elysia (factory answers and submission, evaluator verdicts, hard reject, finalize, the evaluation period), model-checked with TLC. Use before merging any change to src/service/evaluator-review.ts saveAnswerVerdict or finalize, to answer/update/submit/negotiate in src/service/answer.ts, or to evaluationPeriodApplies in src/utils.ts, and to check whether a change to verdict, finalize or fiscal-year rules can reach a bad state.
---

# Review flow model

`model/ReviewFlow.tla` models one Cover of one fiscal year: its Answers, the factory's writes, the
reviewers' verdicts, finalize, and the fiscal-year phases (the Cover's own year, the evaluation
period after the 1 Oct rollover, and after it). TLC explores every order of those steps for three
Answers and reports the shortest sequence that breaks a rule.

## Rules checked

These must hold. `model/ReviewFlow.cfg` checks them, and a failure blocks the change.

- `FinishedCoverHasAward`. A finished Cover always has its Award. Harm if broken: a factory sees a
  finished Cover with no Grade, and consec-gold history loses a year.
- `OnlyHardRejectDeletesEvidence`. Evidence is deleted only for a hard reject, never for a score
  change (ADR-0012). Harm: a factory loses files for a verdict that never asked it to redo anything.
- `NoBounceDuringEvaluation`. No Cover is sent back to the factory during the evaluation period
  (ADR-0012, amended). Harm: the factory cannot edit a closed year, so the Cover is stranded.
- `FinishedIsFinal`. A finished Answer never changes status again (ADR-0005). Harm: a settled
  result is reopened.

## Known findings

Each has a `model/Finding_*.cfg` that is expected to FAIL against today's code. They are reported,
not fixed. No product code was changed for them.

- `NoBounceAfterEvaluation`. After the evaluation period ends, ODPC may still write the closed
  year, and a hard reject is allowed again. Shortest path: the factory answers a question; the
  rollover; the evaluation period ends; ODPC hard-rejects the Answer; ODPC finalizes. The Cover goes
  back to `in_progress`, its files are deleted, and the factory cannot edit that year, so the Cover
  can never finish. The evaluation-period block only postpones this case; it does not remove it.
- `FinishOnlyAfterSubmission`. Neither `saveAnswerVerdict` nor `finalize` checks the Cover's
  status. Shortest path: ODPC finalizes a Cover that has no Answer rows yet. Drizzle 0.45.1 turns
  the empty `inArray` into `false`, nothing is `in_review`, and the Cover becomes `finished` with an
  Award. A longer path does the same to a partly answered, never-submitted Cover: the factory answers
  some questions, a reviewer approves them, ODPC finalizes. The same missing gate lets a reviewer
  save a verdict on an Answer while its Cover is back with the factory, including a `change_score`
  on a hard-rejected Answer whose files finalize already deleted.

## How to run

From the repo root, with Java 17 or later:

```bash
.claude/skills/review-flow/scripts/check.sh check      # the rules; must print PASS
.claude/skills/review-flow/scripts/check.sh findings   # known findings; each must still fail
.claude/skills/review-flow/scripts/check.sh mutants    # each broken model variant must be caught
.claude/skills/review-flow/scripts/check.sh drift      # covered code changed since the sync commit
```

`check.sh` downloads TLC (`tla2tools.jar` v1.7.4, checksum pinned) into the gitignored `tools/`
folder on first use. A run takes about one second.

Read every result with the pstack `/statechart` skill. It tells each violation TLC finds as its
shortest path in plain words, and draws the state chart when the check passes.

## Scope and bounds

- Three Answers for the rules and two for the findings. One Cover, one fiscal year.
- Reviewers act as ODPC: the level that can finalize and write a closed year. Category scope,
  Mental and DOH limits, and the "recommended: author or ODPC" edit rule are not modeled.
- Standard certificates, their deletion and the collateral reset to `in_review` are not modeled.
- MinIO failures, transactions and email are not modeled. Finalize is one atomic step, which matches
  the code only because the file deletion happens before the transaction and aborts it on failure.
- Grade values are not modeled, only whether an Award exists. The grade ladder is pure code
  (`computeGrade`) and is better covered by tests.

## Coverage record

| Model action | Code |
| --- | --- |
| `Rollover`, `EvalEnds` | `evaluationPeriodApplies`, `EVALUATION_DAYS` in `src/utils.ts` |
| `FactoryWritable` | `resolveWritableYear` in `src/service/answer.ts` |
| `Answer(a)` | `answerService.saveAnswer` |
| `Edit(a)` | `answerService.update`, and `negotiate` with `redo` |
| `Submit` | `answerService.submit` |
| `Verdict(a, changeScore)` | `evaluatorReviewService.saveAnswerVerdict`, approve and change_score |
| `HardReject(a)` | `saveAnswerVerdict` with reject, `assertHardRejectAllowed` |
| `Finalize` | `evaluatorReviewService.finalize` |

Sync commit: `e0bed76` (2026-11-06). The model was last confirmed to describe the covered code at
this commit. `check.sh` holds the same value in `SYNC_COMMIT`.

## When the code changes

1. Run `check.sh drift`. If it lists nothing, the model still describes the code; run `check` and
   stop.
2. Otherwise read the diff of each listed file against the coverage record. If a change alters a
   guard, a status written, or what a step reads, change the matching action in
   `model/ReviewFlow.tla` to match the code. Keep every action pointing at the code it models.
3. Run `check`, `findings` and `mutants`.
   - `check` fails: read the trace with `/statechart` and map each step to the code. If the steps
     are possible in the code, it is a real bug. Report it with the trace in the code's words. Do
     not weaken the rule or the model to make it pass. If a step is impossible in the code, the
     model is wrong: fix the action, not the rule.
   - A finding now passes: confirm in the code that the gap is closed, move it to the rules (into
     `ReviewFlow.cfg`) and delete its `Finding_*.cfg`.
   - `STALE MUTANT`: a mutant's anchor text changed. Update `scripts/mutants.txt` so the mutant still
     breaks the same rule.
4. Only after the model matches the code at the new commit, set the new sync commit in this file
   and in `SYNC_COMMIT` in `check.sh`.

Use `/maintain-formal-verification-skill` for a full resync after several changes landed without
this check.
