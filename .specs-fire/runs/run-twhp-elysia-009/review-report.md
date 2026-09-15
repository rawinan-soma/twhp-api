---
run: run-twhp-elysia-009
work_item: standard-file-deletion-on-hard-reject
intent: score-change-finality
generated: 2026-08-25T09:32:00Z
---

# Code Review: run-twhp-elysia-009

## Files

| File | Change |
|------|--------|
| `src/service/evaluator-review.ts` | `finalize`: widened reads, doomed-standard collection, collateral set, certificate deletion, enrollment un-claim, collateral reset |
| `src/service/evaluator-review.verdict.integration.test.ts` | 23 → 30 tests; `questionId` override; standards fixture helpers |

## Auto-fixed

Formatting only.

## Findings

### 1. Drizzle select inference — MEDIUM, fixed in-run

A computed select object (`...Object.fromEntries(...)`) silently degrades Drizzle's row type to the
raw table shape, which broke four existing `enrollData.email` / `.ccEmail` references. Enumerated
explicitly instead. `STANDARD_ENROLL_COLUMNS` still drives every *read* of those fields, so the
mapping has one owner even though the select cannot be generated from it.

### 2. Collateral is subtracted from promotions, not reversed — INFO

The plan's sharpest edge, handled as specified: `collateralIds` is computed *before* `promotionRows`
and filtered out of it, so no Answer can receive both a `finished` and an `in_review` row in one
transaction. A test asserts the collateral's latest status is `in_review`, which would fail if both
rows were written.

### 3. `open` membership check is a linear scan — LOW

`collateralIds` filters with `open.some(...)` per candidate, so the cost is O(answers²) within one
Cover. A Cover holds ~41 answers, so this is immaterial; noted rather than optimised to keep the
classification readable.

### 4. Blast radius is real and now executable — MEDIUM, by design

One rejection deletes up to five externally-issued certificates, un-claims them for the fiscal
year, and reopens sibling answers. Irreversible: no MinIO versioning. This is decision 1 + 2 from
the approved design; the ADR must carry it prominently, and an evaluator-side confirmation in the
frontend is worth requesting.

### 5. Already-`finished` collateral keeps an unevidenced score — MEDIUM, bounded by design

Decision 6. Tested explicitly so the boundary reads as intentional.

## Standards compliance

- ✅ File I/O outside and before the transaction; strict delete; abort-before-write intact.
- ✅ Single `coverLogs` transition; finalize still the only writer of `finished`.
- ✅ No schema change; existing columns updated in place.
- ✅ Reuses `STANDARD_ENROLL_COLUMNS` rather than introducing a second mapping.
