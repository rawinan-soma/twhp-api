---
run: run-twhp-elysia-009
work_item: standard-file-deletion-on-hard-reject
intent: score-change-finality
completed: 2026-08-25T02:33:00.861Z
---

# Walkthrough: Hard reject deletes the standard certificate too

## What changed

A hard reject on a standard-backed question used to delete **nothing**. Such an Answer holds no
per-answer files — `selectedChoice` was force-set to `"3"` from the certificate on the enrollment —
so the deletion loop found nothing, and the redo re-derived the same `"3"`. The rejection was a
no-op loop.

Now a hard reject deletes every standard the question **names** and the factory **claims**:

```
reject q23  (names Wellness, Safety, TIS18001, ISO45001, Zero)
  ├── certificates → deleteFileStrict, with the per-answer files, before the txn
  ├── enrollment   → urls NULL, booleans false        (in txn)
  ├── collateral   → q22/q25/q26 not yet `finished` → in_review instead of promoted
  └── cover        → in_progress; the factory re-answers with real evidence
```

Un-claiming the booleans is what makes the redo coherent: it preserves the invariant
`enroll.create` enforces (a claimed standard must have a file), so the question falls through to a
normal file-based answer instead of erroring with `standard file not found in enroll`.

## The edge the plan called out, and how it was handled

Collateral had to be **subtracted from** `promotionRows`, not reversed afterwards — otherwise an
Answer would receive both a `finished` and an `in_review` row in the same transaction, and the
latest-log-wins read would resolve to whichever landed second. `collateralIds` is therefore computed
before the promotions and filtered out of them.

## One trap worth remembering

Building the widened `enrollData` select by spreading `STANDARD_ENROLL_COLUMNS` collapsed Drizzle's
row inference to the raw table shape (`{ Accounts: any; Covers: any; … }`) and broke four existing
`enrollData.email` references. A computed select object cannot carry column types. The eleven pairs
are enumerated explicitly; the map still drives every *read*.

## Files

| File | Change |
|------|--------|
| `src/service/evaluator-review.ts` | `finalize`: widened reads, doomed-standard collection, collateral set, certificate deletion, enrollment un-claim, collateral reset |
| `src/service/evaluator-review.verdict.integration.test.ts` | 23 → 30 tests; `questionId` override in `seedCover`; standards fixture helpers |

## Verification

`bun test` — **537 pass, 0 fail, 1 skip**. `tsc --noEmit` — 32 errors, the unchanged baseline.

Covered: all named+claimed standards deleted; unclaimed ones spared; a shared certificate deleted
once; booleans and urls cleared; collateral reset; already-`finished` collateral untouched;
unrelated answers promoted normally; a score change deletes nothing.

## What this makes possible, and what it costs

**Possible:** a rejection of a standard-backed question is now effective. The factory must supply
real evidence, or re-obtain and re-claim the certificate.

**Cost, by design and worth restating:**

- One rejection deletes up to **five externally-issued certificates** and un-claims them for the
  whole fiscal year — not just this Cover.
- **Irreversible**: no MinIO versioning is configured, and a certificate comes from an issuing
  body, not a re-upload.
- Sibling answers that were never rejected are reopened and must be re-reviewed.
- An already-`finished` sibling keeps a `"3"` backed by a deleted certificate — bounded deliberately,
  since reopening it would break "`finished` is immutable to everyone".

**Recommendation for the frontend**: an evaluator-side confirmation before a hard reject on a
standard-backed question, naming the certificates that will be destroyed. Outside this repo, but
this run is what makes it necessary.
