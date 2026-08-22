---
run: run-twhp-elysia-003
work_item: past-year-write-authority
intent: fiscal-year-addressing
generated: 2026-08-22T15:30:00Z
status: passed
---

# Test Report: Past-fiscal-year write authority for DOED and ODPC

## Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Gate coverage (`evaluator-review.pastyear.test.ts`) | 12 | 0 | 0 |
| **New this run** | **12** | **0** | — |
| Carried from runs 001–002 | 468 | 0 | 1 |
| **Total** | **480** | **0** | 1 |

```
bun test src  ->  479 pass · 1 skip · 0 fail · 480 tests · 23 files
```

Baseline chain: 357 (pre-intent) → 396 (run 001) → 468 (run 002) → 480. **Zero regressions at every
step.**

## Acceptance Criteria Validation

- ✅ **ODPC may write a closed year** — asserted positively: the caller reaches
  `"answer not found in this cover"`, the step immediately downstream of the gate. Reaching it is
  proof the gate let the caller through.
- ✅ **DOED may write a closed year** — same assertion via `adminReviewerContext`, which supplies
  `level: "ODPC"`, `region: null`.
- ✅ **Mental is refused for a closed year** — receives `fiscal year {N} is closed; only ODPC may
  write to it`.
- ✅ **DOH is refused for a closed year** — same.
- ✅ **Mental and DOH are unaffected for the current year** — both reach the same downstream
  `"answer not found in this cover"`. This is the regression the gate could most easily have caused,
  and it is asserted for both tier-1 levels.
- ✅ **ODPC is unaffected for the current year.**
- ✅ **Out-of-region caller receives the existing 404, not the year message** — proving the region
  check still runs first, so no caller learns that a Cover exists in a particular year.
- ✅ **An absent Cover returns the existing 404.**
- ✅ **`finalize` keeps its ODPC-only refusal ahead of any year check** — a non-ODPC caller receives
  `"finalize is restricted to ODPC"` and never reaches a database read.
- ✅ **`finalize` lets ODPC past the year gate on a closed year.**
- ✅ **Authority does not expire** — the gate compares the target year against the current one and
  has no time bound beyond that.
- ✅ **No new middleware, route, or schema file** — `git status` shows exactly one modified source
  file (`src/service/evaluator-review.ts`) and one new test file for this run.

## Assertion Strength

Worth stating plainly: the four *allow* assertions would still pass if the gate were removed
entirely — they assert that a caller reaches the next step. The gate's existence is proved by the
**refusal** assertions (Mental and DOH on a closed year), which would fail without it.

The pairing is deliberate. Refusals prove the gate exists; allows prove it is not over-broad. Either
alone would be insufficient.

## Verification Beyond Tests

```
files changed this run : src/service/evaluator-review.ts (M)
                         src/service/evaluator-review.pastyear.test.ts (new)
routes / middleware / schema / migrations : none
```

Write paths still calling `getFiscalYear()` with no argument — **seven**, all untouched:

```
cover.create · enroll.create · enroll.updateEnroll
answer.saveAnswer · answer.submit · answer.update · answer.negotiate
```

Plus one new call in `assertYearWritable`, which reads the *current* year deliberately.

**Correction:** the plan and run 002's walkthrough both stated this figure as "five". That
under-counted `answer.ts`, which retains four write-path calls, and omitted `cover.create`. Both
documents are corrected. The verification itself passes; only the expected number was wrong.

## Lint

```
before:  3 errors · 30 warnings · 3 infos
after:   3 errors · 30 warnings · 3 infos
```

Zero introduced.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Test teardown deleted `Covers` before `CoverLogs`, violating `CoverLogs_cover_id_Covers_id_fk`. The `finalize` test passes the gate and genuinely writes a log row — the failure was the teardown's, not the gate's | Medium | **Fixed** — teardown now removes `CoverLogs` first. Orphaned fixture rows from the failed run were cleared manually before re-running |
| **A source edit silently did not apply.** A string replacement targeted a line Biome had already reflowed, so the match failed and the write was a no-op. The test then failed for the original reason and looked like a different bug | Medium | **Fixed** — the edit was reapplied against the current file content and *verified by reading it back*. This is the second occurrence of this class in the intent; the first was `state.yaml` during planning |
| The two ODPC assertions originally checked only "not the refusal", which a removed gate would also satisfy | Low | **Strengthened** — now assert the exact downstream message, which is positive proof of passage |

The silent no-op is the one worth carrying forward: **verify an edit landed rather than assuming it
did**, especially after a formatter has touched the file.

## Ready for Completion

- [x] All tests passing (480, zero failures)
- [ ] Coverage target met — no target configured; not measured
- [x] All acceptance criteria validated
- [x] No critical issues open
- [x] Zero regressions
- [x] Zero Biome findings introduced
- [x] Scope confirmed: one source file, one test file

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-003*
