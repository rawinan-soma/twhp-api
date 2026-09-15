---
run: run-twhp-elysia-006
work_item: finalize-settles-score
intent: score-change-finality
mode: validate
checkpoint: plan
approved_at: null
---

# Implementation Plan: Finalize settles the verdict score and spares its evidence

Based on `finalize-settles-score-design.md` (Checkpoint 1 approved 2026-08-24).

## Approach

One classification replaces the `status === "rejected"` test that four separate places currently
key off. Everything else follows from it.

1. **Classify once, after `resolved` is built** (`:478-486`):
   - `settledScoreIds` — latest log has a non-null `verdictChoice`, whatever its status
     (`recommended` = new, `rejected` = legacy)
   - `hardRejectIds` — `status === "rejected"` **and** null `verdictChoice`
2. **Deletion set** (`:510-514`) becomes `hardRejectIds`.
3. **Promotions** (`:496-508`) carry `verdictChoice` forward for settled score changes.
4. **Settled write** — inside the transaction, `selectedChoice := verdictChoice` per settled Answer.
5. **Cover status** (`:544-545`) — `hasHardReject` instead of `hasRejected`.
6. **Grade** (`:574-580`) — overlay settled choices in memory before `calculateBreakdown`.

Ordering is unchanged: classify → delete (outside, before txn) → txn → Grade → email.

## Files to Modify

| File | Changes |
|------|---------|
| `src/service/evaluator-review.ts` | `finalize` only: classification, deletion set, promotion rows, `selectedChoice` writes, cover-status predicate, Grade overlay |
| `src/service/evaluator-review.verdict.integration.test.ts` | Update the finalize expectations that encode ADR-0006; these rows are the legacy shape and become the compatibility coverage |

## Tests

| Test File | Coverage |
|-----------|----------|
| `src/service/evaluator-review.verdict.integration.test.ts` | Score-change-only Cover → `finished`, files intact, `selectedChoice` updated, Grade reflects the correction; mixed Cover → `in_progress` with only the hard reject's files deleted; legacy `rejected` + `verdictChoice` row treated as settled; hard reject unchanged; promotion row retains `verdictChoice`; `in_review` gate unchanged |

## Technical Details

**Why classify on `verdictChoice` rather than status.** A settled score change arrives in two
shapes — `recommended` (post-run-005) and `rejected` (production rows written before it). Keying on
the discriminator that both share is what removes the need for a backfill. `verdictChoice` is only
ever written by `change_score`, so a non-null value cannot mean anything else.

**Grade overlay.** `allCoverAnswers` is read before the transaction, so it still holds
pre-correction values afterwards. `gradeAnswers` maps settled Answers to their `verdictChoice`
before `calculateBreakdown`; the DB write and the in-memory value are derived from the same source,
so they cannot disagree.

**Not in this run**: the negotiate endpoint, the email body, and the ADR — each is its own work
item. After this run the intent's behavioural change is complete and deployable; items 3-5 are
correctness-of-presentation and documentation.

---
*Plan approved at checkpoint. Execution follows.*
