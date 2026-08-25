---
run: run-twhp-elysia-008
work_item: finalize-email-changed-answers
intent: score-change-finality
generated: 2026-08-24T08:45:00Z
status: passing
---

# Test Report: Finished-Cover notification (no change required)

## Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Full suite (`bun test`) | 530 | 0 | 1 |
| `answer.integration.test.ts` | 9 | 0 | 0 |

**No production code was written this run.** `git status` confirms `src/worker/` and `src/queue/`
are untouched. The run exists to prove the read path carries the correction, which nothing tested.

## Acceptance Criteria Validation

The work item's original criteria assumed an email change and were superseded by the human's
decision on 2026-08-24. Against the revised plan:

- ✅ **The finished email is unchanged** — `src/worker/email.ts` and the `verdict-result-finished` payload byte-identical.
- ✅ **`verdict-result-in-progress` unchanged** — untouched.
- ✅ **A corrected answer reads back as the record** — after a real `finalize`, the factory's own read returns `status: finished`, `verdictChoice: "1"`, and the evaluator's Thai reason.
- ✅ **A correction is distinguishable from an approve** — an untouched answer reads back with `verdictChoice: null`, which is the flag a UI keys off.
- ✅ **The settled score is the live choice** — `selectedChoice` reads back as the corrected value.
- ✅ **`bun test` passes** — 530/0.

## Tests Written

- `getAnswerByFactoryId — a settled correction after finalize` (2 tests). Resolves the fixture
  Cover to a finalizable state, runs a **real** `finalize` with the email queue spied out, then
  reads back through the factory's own service method.

This is the first end-to-end coverage joining the evaluator and factory sides: run 007 asserted the
promotion row, but nothing asserted what the factory actually reads after a Cover finishes.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| The factory cannot see its **original** claim after finalize — `selectedChoice` is overwritten and the original is preserved nowhere | medium | **Open by design.** Accepted at the `finalize-settles-score` design checkpoint; the declined email section would have been its last surface. Needs a schema change to fix — flagged for a separate intent, recorded in the ADR |

## Ready for Completion

- [x] All tests passing
- [x] Revised acceptance criteria validated
- [x] No critical issues open
