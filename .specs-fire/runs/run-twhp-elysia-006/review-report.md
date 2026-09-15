---
run: run-twhp-elysia-006
work_item: finalize-settles-score
intent: score-change-finality
generated: 2026-08-24T05:42:00Z
---

# Code Review: run-twhp-elysia-006

## Files

| File | Change |
|------|--------|
| `src/service/evaluator-review.ts` | `finalize` — classification, deletion set, promotions, settled-score write, cover status, Grade overlay |
| `src/service/evaluator-review.verdict.integration.test.ts` | 17 → 23 tests; the ADR-0006 case rewritten |

## Auto-fixed

Formatting only (`biome check --write` on the service file). No semantic change.

## Findings

### 1. Promotion widening swept in already-`finished` Answers — MEDIUM, fixed in-run

Changing the promotion filter from `status === "recommended"` to "everything not hard-rejected"
silently included Answers that a previous finalize had already promoted. A Cover that bounces and
is finalized again would append a duplicate `finished` row per Answer on every pass — and, with
`verdictChoice` now carried forward, re-apply the settled write each time.

Caught by inspecting the diff, not by the suite. Fixed with an `open` set (`status !== "finished"`)
feeding classification, promotion, and settling; a re-finalize test now locks it.

### 2. `selectedChoice` cast at the update site — LOW

`settledChoiceById` holds `string`, so the update casts to the column's enum union. `verdictChoice`
is schema-constrained to `0-3` at the API boundary, so the value is always valid; the cast documents
an invariant the type system loses across the Map. Acceptable, noted.

### 3. `resolved` is now read through `open` everywhere except the `in_review` gate — INFO

Deliberate: the gate must see every Answer, including `finished` ones, to refuse a finalize with
unresolved work. Left as-is.

## Standards compliance

- ✅ File I/O outside and before the transaction; `deleteFileStrict` semantics unchanged.
- ✅ Single `coverLogs` transition; finalize remains the only writer of `finished`.
- ✅ No schema change, no migration touched.
- ✅ Service returns `status(code, body)`.
- ✅ Comments explain the *why* of classifying on `verdictChoice` (legacy compatibility).
