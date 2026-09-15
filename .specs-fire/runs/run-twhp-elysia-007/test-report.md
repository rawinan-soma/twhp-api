---
run: run-twhp-elysia-007
work_item: retire-score-negotiation
intent: score-change-finality
generated: 2026-08-24T08:20:00Z
status: passing
---

# Test Report: Retire the negotiation path for score changes

## Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Full suite (`bun test`) | 528 | 0 | 1 |
| `answer.integration.test.ts` | 7 | 0 | 0 |

The negotiate endpoint had **no test coverage at all** before this run — the `accept` path was
untested in every shape. Four tests now pin the contract.

## Acceptance Criteria Validation

- ✅ **`accept` on a score change → clear 400** — asserted for the new (`recommended`) and legacy (`rejected` + `verdictChoice`) shapes.
- ✅ **`redo` on a settled score change is refused too** — nothing is owed, in either direction.
- ✅ **`accept` on a hard reject keeps its own message** — `"redo instead"`, unchanged.
- ✅ **`redo`/`object` on a hard reject unchanged** — pre-existing behaviour, suite green.
- ✅ **The corrected score and its reason survive finalize** — the `finished` promotion row retains `verdictChoice` *and* `description`.
- ✅ **`verdictChoice` stays in the response contract** — schema untouched; only the comment changed.
- ✅ **Stale comments rewritten** — `answer.ts`, `routes/factories/assessments/index.ts`.
- ✅ **`bun test` passes** — 528/0.

## Tests Written

- `negotiate — a settled score change admits no factory response` (4 tests), plus a fixture answer
  in the post-intent shape (`recommended` + `verdictChoice`) and a `coverLogs` `in_progress` row,
  since negotiate is only open while the Cover sits with the factory.
- `evaluator-review.verdict.integration.test.ts` — promotion-row test extended to assert the
  description survives; `seedCover`/`latestOf` now carry `description`.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| The finality guard placed inside the `accept` branch never fired for the new shape — the earlier `status !== "rejected"` guard returned a generic message first | medium | **Fixed** — moved ahead of the status guard, so it covers `recommended`, `finished` and legacy `rejected` alike, and both actions |
| Moving the guard made the retained `accept` body unreachable, so TypeScript dropped its null-narrowing (2 new errors) | low | **Fixed** — the invariant is restated with an explicit type at the assignment; back to the 32-error baseline |
| **Reason lost at finalize**: run 006's promotion row nulled `description`, so a finished Cover showed a corrected score with no explanation | medium | **Fixed in this run** — `description` carried forward with `verdictChoice` |

## Ready for Completion

- [x] All tests passing
- [x] All acceptance criteria validated
- [x] No critical issues open
