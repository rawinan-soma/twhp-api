# ADR 0001: Score calculated on-demand, not persisted

**Status:** Accepted — amended 2026-09-21: the Grade is now stored (see Amendment). The Score stays on demand.

## Context

The score calculator feature needs to derive a numeric score from a Cover's Answers. The choice was between calculating on every request vs. storing a computed score column on the Cover or a separate table.

## Decision

Scores are calculated on-demand at query time and never written to the database.

## Reasons

- Answers can be updated (re-reviewed, rejected and resubmitted) while a Cover is `in_review`. A cached score would go stale and require invalidation logic.
- The calculation is a simple arithmetic aggregation over a bounded set of rows (one Cover has exactly N answers where N = total questions). Query cost is negligible.
- Keeping score out of the schema avoids a migration and keeps the feature purely additive — no existing tables change.

## Consequences

- Score is always consistent with the current state of Answers.
- If scoring rules change (weights, formula), old covers are automatically re-scored with the new rules. This is acceptable — historical scores are not audited separately.
- If query performance becomes a concern at scale, a materialised view or a cached column can be added later without changing the API contract.

## Amendment (2026-09-21): the Grade is stored at finalize

The Score, and the per-category breakdown, are still computed on demand. The **Grade** is not. Finalize
writes it once, to the `Awards` table, in the same transaction that writes the `finished` `coverLogs`
row, and every read path (the factory Score Report, the three staff Score Report lists, the finalize
response) returns the stored value. A Grade is never recomputed for a Cover.

Why: the consequence recorded above — *"old covers are automatically re-scored with the new rules… historical
scores are not audited separately"* — is no longer acceptable. Two award decisions (the consecutive-gold
tier and the gold-tier enrolment lockout, `.scratch/consecutive-gold-award/`) audit past Grades, and the gold
gate is being loosened in the same release, so a live recompute could turn a past `silver` into a `gold`
and retroactively lock a factory out of an enrolment it already made.

- One row per factory per fiscal year (`Awards.factory_id`, `fiscal_year`), fiscal year in Common Era.
  `cover_id` is null for imported history and unique otherwise; deleting an awarded Cover is restricted.
- The row's fiscal year is the Cover's own, not the current one.
- A repeat finalize keeps the first stored Grade (`ON CONFLICT (cover_id) DO NOTHING`).
- Covers finalized before this change hold no row until the manual backfill (issue 04) writes one, and
  read `grade: null` until then. Two Covers with identical Answers can therefore report different Grades
  once the gate changes. That is deliberate.
