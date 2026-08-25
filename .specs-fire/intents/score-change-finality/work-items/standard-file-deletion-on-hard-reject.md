---
id: standard-file-deletion-on-hard-reject
title: Hard reject deletes the standard certificate too
intent: score-change-finality
complexity: high
mode: validate
status: completed
depends_on:
  - finalize-settles-score
created: 2026-08-24T05:10:00Z
run_id: run-twhp-elysia-009
completed_at: 2026-08-25T02:33:00.861Z
---

# Work Item: Hard reject deletes the standard certificate too

## Description

When an evaluator hard-rejects an Answer to a standard-backed question, finalize should delete the
factory's standard certificate as well as the per-answer files.

Today finalize deletes only `answers.fileUrl1_1..fileUrl3_3`. A standard-backed Answer whose
factory holds the standard has **no** per-answer files at all — `selectedChoice` is force-set to
`"3"` from the certificate (`answer.ts:129-141`, `:522-546`) — so a hard reject currently deletes
nothing, and the redo branch re-derives `factoryHasMatchingStandard` and forces `"3"` straight
back (`answer.ts:876+`). The rejection cannot change the answer, which makes it a no-op loop.

Deleting the certificate closes that: with the file gone, `answer.ts:133-134` refuses the redo
until the factory uploads a new one through the enrollment.

## Open design questions (for the design doc)

1. **Blast radius.** Certificates live on `Enrolls` (`standard_HC_url` … `schema.ts:200-220`), not
   on the Answer, and several questions share one standard — `standardSafety` backs questions 22,
   23, 25 and 26; `standardISO45001`/`standardTIS18001`/`standardWellness` back 22, 25 and 26.
   Deleting one certificate removes the evidence behind every question relying on it. Does a
   rejection on **one** question justify that, or should deletion require every question backed by
   that standard to be hard-rejected?
2. **Which certificate?** A question names a *list* of standards and the factory may hold several
   (q23 names five). Delete all the factory holds, or only some?
3. **Do the `Enrolls` booleans flip too?** Deleting `standard_safety_url` while `standardSafety`
   stays `true` leaves the enrollment claiming a standard it has no evidence for, and the redo
   path errors rather than falling through to a normal file-based answer. Flipping the boolean is
   more coherent but rewrites the enrollment record.
4. **Scope beyond the cover.** `Enrolls` is the fiscal-year enrollment, not the Cover. Deleting a
   certificate reaches past this review into eligibility and reporting for the whole year.
5. **Reversibility.** MinIO deletes are irreversible (no versioning configured, per
   `docker-compose.yaml:185-194`). A wrongly-rejected standard-backed answer destroys a certificate
   the factory must obtain again from its issuing body — a heavier consequence than losing an
   uploaded photo.

## Acceptance Criteria

- [ ] Design doc resolves questions 1-5 with rationale before implementation.
- [ ] Hard reject on a standard-backed Answer deletes the agreed certificate(s) at finalize,
      outside and before the transaction, using `deleteFileStrict`.
- [ ] A MinIO failure aborts finalize before any DB write, as today.
- [ ] `change_score` on a standard-backed Answer deletes nothing — it is terminal and settled.
- [ ] Per-answer file deletion for non-standard hard rejects is unchanged.
- [ ] The redo path after a certificate deletion is coherent: the factory is told to re-upload
      rather than hitting an opaque 400.
- [ ] Cross-question effects are covered by tests — reject q23, assert what happens to q22/q25/q26.
- [ ] `bun test` passes.

## Technical Notes

This amends the intent's constraint that "hard reject is byte-for-byte unchanged". That constraint
held for work items 1-5; this item deliberately relaxes it, and the ADR must say so.

Sequenced after `finalize-settles-score` because both modify the same deletion block, and the
classification introduced there (hard reject = `rejected` + null `verdictChoice`) is what this item
keys off.

## Dependencies

- finalize-settles-score
