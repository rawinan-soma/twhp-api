---
work_item: standard-file-deletion-on-hard-reject
intent: score-change-finality
created: 2026-08-24T09:00:00Z
mode: validate
checkpoint_1: approved
approved_at: 2026-08-25T00:00:00Z
---

# Design: Hard reject deletes the standard certificate too

## Summary

A hard reject on a standard-backed question currently deletes nothing — the Answer has no
per-answer files, because `selectedChoice` was force-set to `"3"` from the certificate on the
enrollment. The redo then re-derives the same `"3"`, so the rejection cannot change anything.

This design deletes the certificates behind the rejected question and un-claims them on the
enrollment, so the factory must supply new evidence before that question can be answered again.

## Scope

**In** — certificate deletion and boolean un-claiming at finalize, for hard-rejected
standard-backed Answers.

**In, added 2026-08-25** — resetting collateral Answers that were scored from a deleted
certificate and are not yet `finished`.

**Out** — per-answer file deletion (unchanged), score changes (delete nothing), and reopening
collateral that is already `finished`.

## Key Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Which certificates does one rejection delete? | **Every standard the question names that the factory holds** | Human decision, 2026-08-24. Taken over the two narrower options (delete only when every backed question is rejected; delete only uniquely-backing certificates). The rejection is read as "this claim is not credible", and the claim is the certificate. |
| 2 | Do the `Enrolls` booleans flip to `false`? | **Yes** | Human decision, 2026-08-24. Preserves the invariant `enroll.create` enforces — a claimed standard must have a file (`enroll.ts:202-208`). Without the flip, `saveAnswer` returns an opaque `404 standard file not found in enroll` on redo; with it, the question falls through to a normal file-based answer. |
| 3 | Where does deletion happen? | `finalize`, outside and before the transaction | Same pipeline and ordering as per-answer deletion. `deleteFileStrict`, so a MinIO failure aborts finalize before any DB write. |
| 4 | Which Answers trigger it? | Hard rejects only (`rejected` + null `verdictChoice`) | A settled score change deletes nothing — it is closed, and the intent's whole premise is that it costs the factory no evidence. |
| 5 | Column mapping source | Reuse `STANDARD_ENROLL_COLUMNS` (`evaluator-review.ts:29-42`) | Already the authoritative `standard → (bool, url)` pairing, built for intent 009. No second mapping. |
| 6 | Do collateral Answers get reset? | **Yes, but only those not yet `finished`** | Human decision, 2026-08-25. An Answer scored `"3"` purely from a certificate that this finalize deletes has lost its basis, so it returns to `in_review` for the factory to re-answer with real evidence. Already-`finished` collateral is left alone: reopening it would overturn "`finished` is immutable to everyone", the invariant `recommended` was introduced to protect (CONTEXT.md:100,110,213,218,221; ADR-0004 Gap 1). That is a separate intent, not a rider here. |
| 7 | What happens to a reset Answer's `selectedChoice`? | Left as-is | `selectedChoice` is `NOT NULL` with no "unanswered" value. `in_review` is the signal that it must be re-answered; the stale `"3"` is replaced when the factory does. With the standard un-claimed, `update` treats the question as a normal file-based one. |

## Technical Approach

```
finalize
  │
  ├── hard rejects (rejected + null verdictChoice)
  │     ├── per-answer files      → deleteFileStrict  (existing)
  │     └── standard-backed?      → for each standard the question names
  │            and the factory holds (bool = true):
  │              certificate url  → deleteFileStrict  (NEW)
  │              bool             → false             (NEW, in txn)
  │              url              → null              (NEW, in txn)
  │
  ├── collateral: any OTHER Answer whose question is backed by a deleted
  │     standard and whose status is NOT `finished`
  │        → written `in_review` instead of promoted   (NEW)
  │        → `selectedChoice` left as-is (no unanswered value exists)
  │
  └── settled score changes → nothing deleted (unchanged)
```

The question→standards mapping comes from `questions.standard`, already joined in
`allCoverAnswers`; add `standard` to that select. The enrollment row is already read for the
verdict email (`enrollData`), so the booleans and urls join the same read.

Deletion is deduplicated: two rejected questions sharing `standardSafety` delete it once.

### Database Changes

None. Existing `Enrolls` columns are updated in place.

## Risks & Mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **Already-`finished` collateral keeps a score whose evidence is gone.** Rejecting q23 deletes `standardSafety`, which also forced `"3"` on q22, q25 and q26. Not-yet-`finished` ones return to `in_review` (decision 6); one promoted by an *earlier* finalize stays `finished` with nothing behind it. | Bounded and deliberate. Reopening it would overturn a five-times-stated invariant and belongs to its own intent. Tests assert both halves — reset where allowed, untouched where `finished` — so the boundary is explicit rather than incidental. |
| 7 | **A reset re-opens work the evaluators had already settled.** Collateral returning to `in_review` must be re-reviewed after the factory re-answers. | Correct and intended: their evidence is gone. The Cover is bouncing to `in_progress` regardless, since a hard reject is what triggered this. |
| 2 | **One rejection can delete five certificates.** q23 names `standardWellness`, `standardSafety`, `standardTIS18001`, `standardISO45001`, `standardZero`. | Inherent to decision 1. The run logs which certificates a finalize deleted so the effect is inspectable after the fact. |
| 3 | **The enrollment record is rewritten for the whole fiscal year**, not just this Cover. The factory's claimed standards are un-claimed. | Inherent to decision 2. Recovery exists: the factory re-uploads through `enroll.updateEnroll` (`enroll.ts:326`). |
| 4 | **Irreversible.** No MinIO versioning is configured (`docker-compose.yaml:185-194`), and a certificate is issued by an external body — not a re-uploadable photo. A mistaken rejection costs the factory real-world effort. | Cannot be mitigated in code under the no-schema-change constraint. Named prominently in the ADR. Worth pairing with a UI confirmation on the evaluator's side, which is outside this repo. |
| 5 | **The reviewer's own certificate list empties.** `standardFilesFromEnroll` projects `bool && url` (intent 009), so after finalize the review view shows no standards. | Correct given decisions 1-2, and the tests assert it, so it is not mistaken for a regression later. |
| 6 | A MinIO failure mid-way leaves some certificates deleted and others not | Same guarantee as today: `Promise.all` of strict deletes runs **before** the transaction; any failure returns 500 and no DB write occurs. Object deletion itself is not transactional — already true of per-answer files. |

## Implementation Checklist

- [ ] Add `standard` to the `allCoverAnswers` select
- [ ] Read the enrollment's standard bools + urls alongside the existing `enrollData`
- [ ] Collect the certificate set for hard-rejected standard-backed Answers, deduplicated, holding only standards the factory claims
- [ ] Delete via `deleteFileStrict`, outside and before the transaction, with the per-answer files
- [ ] In the transaction, null the urls and set the bools false
- [ ] Collateral Answers backed by a deleted standard and not yet `finished` are written `in_review` rather than promoted
- [ ] Already-`finished` collateral is left untouched
- [ ] Settled score changes on standard-backed questions delete nothing
- [ ] Tests: single rejection deletes every named standard the factory holds; shared certificate deleted once; collateral reset to `in_review`; already-`finished` collateral untouched; score change deletes nothing; booleans flipped; MinIO failure aborts before any DB write
- [ ] `bun test` green
