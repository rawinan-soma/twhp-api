---
stage: model
bolt: 005-score-service
created: 2026-06-12T10:00:00Z
---

## Static Model: score-service (FR-9 breakdown restructure)

This bolt enriches the existing read model. The score calculation rules (choice→points, `n/a` exclusion, fiscal-year scoping, status guard) are unchanged from bolt 001/002. The only domain change: the flat per-group percentage is replaced by a richer **Score Group** value object, and the **Score Report** composes six of them under a **Scoring** value object.

### Entities

- **Score Report**: The computed read model for one Cover. Identity by `coverId`. Properties: `factoryId`, `factoryNameTh`, `coverId`, `coverStatus`, `enrollId`, and a single **Scoring** value object (replacing the six flat score fields). Not persisted (ADR 0001) — materialised on demand.

### Value Objects

- **Score Group**: An immutable measurement for one scoring group, computed from that group's scored answers.
  - Properties: `scoredCount`, `maxScore`, `achievedScore`, `percentage` (all non-negative integers).
  - Invariants:
    - `maxScore == 3 × scoredCount` (max points per answer is 3).
    - `0 ≤ achievedScore ≤ maxScore`.
    - `percentage == round(achievedScore / maxScore × 100)` when `scoredCount > 0`; otherwise `scoredCount = maxScore = achievedScore = percentage = 0` (the empty group — all `n/a` or no scorable answers).
  - Equality by value.
- **Scoring**: An immutable aggregation of exactly six **Score Group**s, keyed `total`, `collaborate`, `disease`, `safety`, `mental`, `outcome`.
  - Invariant: `total` is the Score Group over *all* non-`n/a` answers; each category group is the Score Group restricted to answers whose Question belongs to that QuestionCategory.
  - Consistency: `total.scoredCount == Σ(category.scoredCount)`, `total.achievedScore == Σ(category.achievedScore)`, `total.maxScore == Σ(category.maxScore)` (every scored answer belongs to exactly one category).

### Aggregates

- None new. Score Report is a transient projection, not a persisted aggregate root. No write model, no invariants enforced at persistence time.

### Domain Events

- None. This is a read-only query path; no state transition occurs.

### Domain Services

- **Score Calculator** (`calculateBreakdown`): pure function `Answer[] → Scoring`. For each group it filters scorable (`selectedChoice ≠ "n/a"`) answers, sums `choice_points` (`"3"→3, "2"→2, "1"→1, "0"→0`) into `achievedScore`, derives `scoredCount`, `maxScore = 3 × scoredCount`, and `percentage`. The category groups reuse the same per-group routine (`scoreGroup`) on a category-filtered slice. The `special` field is irrelevant to scoring (unchanged rule).

### Repository Interfaces

- None new. Existing read access (answers + their Question category, joined to cover/enroll/factory/province) is unchanged; only the in-memory shaping of the result changes.

### Ubiquitous Language

- **Score Group**: the four-value measurement (`scoredCount`, `maxScore`, `achievedScore`, `percentage`) for one scoring group.
- **scoredCount**: number of answers that counted toward scoring = non-`n/a` answers in the group.
- **maxScore**: maximum achievable raw points for the group = `3 × scoredCount`.
- **achievedScore**: raw points earned for the group = `Σ choice_points` (the formula numerator).
- **percentage**: `achievedScore / maxScore` as a rounded 0–100 integer (the value the old flat field carried).
- **Scoring**: the set of six Score Groups (overall `total` + five categories) embedded in a Score Report.
- **Empty group**: a group with zero non-`n/a` answers → all four values are `0`.

### Coverage of Story 009 ACs

- Nested `scoring` keyed by `total` + 5 categories → **Scoring** value object.
- Four values per group → **Score Group** value object + invariants.
- `maxScore = 3 × scoredCount`, `percentage = round(achievedScore/maxScore×100)`, empty-group zeros → Score Group invariants.
- Flat fields removed → Score Report no longer carries them (composes Scoring instead).
- Same shape for single (factory) and array (evaluator/provincial/admin) responses → Score Report projection identical in all paths.
