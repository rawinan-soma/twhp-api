---
run: run-twhp-elysia-009
work_item: standard-file-deletion-on-hard-reject
intent: score-change-finality
mode: validate
checkpoint: plan
approved_at: null
---

# Implementation Plan: Hard reject deletes the standard certificate too

Based on `standard-file-deletion-on-hard-reject-design.md` (Checkpoint 1 approved 2026-08-25).

## Approach

Five steps inside `finalize`, reusing the existing classification and delete pipeline.

1. **Widen two reads.** Add `standard` and `enrollId` to the `allCoverAnswers` select; extend the
   `enrollData` query with the eleven `(bool, url)` column pairs, driven by
   `STANDARD_ENROLL_COLUMNS` (`:29-42`).
2. **Collect the doomed standards.** For each hard-rejected Answer whose question names standards,
   take those the factory actually claims (`bool === true && url` non-null). Deduplicate — two
   rejected questions sharing `standardSafety` delete it once.
3. **Delete the certificates** with the per-answer files: one `Promise.all` of `deleteFileStrict`,
   outside and before the transaction. A failure aborts finalize with 500 before any DB write.
4. **Un-claim in the transaction**: each deleted standard's url → `null`, bool → `false`.
5. **Reset collateral.** Any Answer in the Cover whose question is backed by a deleted standard,
   that is not itself hard-rejected and not already `finished`, is written `in_review` instead of
   being promoted.

## Files to Modify

| File | Changes |
|------|---------|
| `src/service/evaluator-review.ts` | `finalize` only: the two widened reads, the standard-collection step, certificate deletion, the un-claim update, and the collateral reset in place of promotion |
| `src/service/evaluator-review.verdict.integration.test.ts` | new describe for certificate deletion and collateral handling |

## Tests

| Test File | Coverage |
|-----------|----------|
| `evaluator-review.verdict.integration.test.ts` | one rejection deletes every claimed standard the question names; an unclaimed standard (`bool false`) is not deleted; a standard shared by two rejected questions is deleted once; booleans and urls cleared; collateral not-yet-`finished` → `in_review`; collateral already `finished` → untouched; a **score change** on a standard-backed question deletes nothing; a MinIO failure aborts before any DB write |

## Technical Details

**Ordering.** Certificate deletion joins the existing pre-transaction delete batch, so the
"file I/O outside the transaction" rule and the abort-before-write guarantee are unchanged. The
un-claim and the collateral reset are DB writes and belong inside the transaction.

**Collateral is derived, not queried.** `allCoverAnswers` already carries every Answer in the
Cover; once `standard` is in the select, the collateral set is a filter over data in hand — no
extra round trip, and no chance of reading post-write state.

**Promotion interaction.** The collateral set must be subtracted from `promotionRows` before they
are written, not reversed afterwards, or an Answer would receive both a `finished` and an
`in_review` row in the same transaction. This is the sharpest edge in the run.

**Cover status is unaffected.** A hard reject already drives `in_progress`; collateral resets
cannot occur without one, so `hasHardReject` needs no change.

**Grade.** Unreachable on this path — a Cover with a hard reject never reaches `finished`, so
`grade` is already `null`.

## Fixture work

The verdict test's enroll fixture sets every standard boolean `false` with no certificate urls. It
needs a variant claiming standards with urls, and the Cover must include the standard-backed
questions (q22/q23/q25/q26) rather than only the current category map.

---
*Plan approved at checkpoint. Execution follows.*
