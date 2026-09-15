---
run: run-twhp-elysia-005
work_item: verdict-save-terminal-score
intent: score-change-finality
generated: 2026-08-24T04:25:00Z
---

# Code Review: run-twhp-elysia-005

## Files

| File | Change |
|------|--------|
| `src/service/answerFileRules.ts` | **new** — single definition of the per-choice evidence rules |
| `src/service/evaluator-review.ts` | three-way status map; evidence guard; `answerRow` query extended |
| `src/service/answer.ts` | inline validator replaced by the shared helper (no behaviour change) |
| `src/service/evaluator-review.save.integration.test.ts` | fixture seeds evidence; 7 tests added, 2 corrected |

## Auto-fixed

None. `biome check` reports no findings on the four files. (`bun run check` reformatted two
*unrelated* files — `src/schema/authentication.ts`, `src/service/score.test.ts` — because the
script runs `--write`; both reverted.)

## Findings requiring confirmation

### 1. The standard-question exemption is broader here than in `accept` — MEDIUM

`answer.ts` exempts a standard question only when the factory actually holds a matching standard
(`factoryHasMatchingStandard`, `:804`); otherwise it falls through to file validation, because the
factory answered that question with uploads like any other.

The new guard exempts **every** question with a non-empty `standard` array, without consulting
`enrolls`. So for a standard-backed question whose factory does *not* hold the standard, an
evaluator can set a choice the files do not support.

This is the simplification the approved plan proposed, and it is recorded here rather than silently
kept. Narrow it by deriving `standardBoolMap` from `enrolls` inside the verdict path — one extra
query per save — if the asymmetry is not acceptable.

**Recommendation**: leave as-is for this run. It only widens what an evaluator may assert on
standard-backed questions, and `finalize-settles-score` is where an unsupported choice would
actually reach a Grade — a better place to decide whether the stricter check is worth the query.

### 2. `answerLogs.description` is still dropped on `approve` — INFO

Unchanged behaviour (`:373`), noted only because a settled score change now shares the
`recommended` status with a bare approve. The two remain distinguishable by `verdictChoice`, which
is the same discriminator finalize will use.

### 3. Response `status` is `t.String()`, not a literal union — INFO

`src/schema/evaluator-review.ts:9`. A tighter union would have surfaced this work item's change as
a compile error at the contract boundary rather than only in tests. Out of scope; worth a cleanup
later.

## Standards compliance

- ✅ Service returns `status(code, body)`; no throwing.
- ✅ No MinIO I/O and no `coverLogs` write added to the save path.
- ✅ No schema change; no migration touched.
- ✅ Helper composed rather than duplicated — one definition of the file rules.
- ✅ Comments explain *why* (the retired negotiation loop) rather than restating the code.
