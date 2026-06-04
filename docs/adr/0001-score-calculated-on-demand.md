# ADR 0001: Score calculated on-demand, not persisted

**Status:** Accepted

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
