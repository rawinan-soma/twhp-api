---
stage: model
bolt: 001-score-service
created: 2026-06-03T00:00:00Z
---

## Static Model: Score Service

### Entities

- **Cover**: Represents one assessment instance per factory enrollment per fiscal year.
  - Properties: `id`, `enrollId`, `startDate`, `status` (derived from latest CoverLog)
  - Business Rules: Only Covers with status `in_review` or `finished` may be scored. A Cover with `in_progress` status must be rejected with an error.

- **Answer**: A factory's response to one Question within a Cover.
  - Properties: `id`, `coverId`, `questionId`, `selectedChoice` (`"0"` | `"1"` | `"2"` | `"3"` | `"n/a"`)
  - Business Rules: `n/a` answers are excluded from both numerator and denominator in all score calculations.

- **Question**: An assessment item with a category classification.
  - Properties: `id`, `category` (QuestionCategory), `special`
  - Business Rules: The `special` field has no effect on scoring — it is a file-upload concern only.

- **Factory**: The organisational entity being assessed.
  - Properties: `accountId` (= factoryId), `nameTh`
  - Business Rules: Scoped to current fiscal year enrollment via `getFiscalYear()`.

---

### Value Objects

- **ChoicePoints**: Immutable mapping from a `selectedChoice` to its numeric point value.
  - `"3"` → 3 pts
  - `"2"` → 2 pts
  - `"1"` → 1 pt
  - `"0"` → 0 pts
  - `"n/a"` → excluded (null)
  - Invariant: Only the five values above are valid choices. No partial mapping allowed.

- **ScoreBreakdown**: Immutable result of scoring one Cover. Six rounded integer values (0–100).
  - Properties: `totalScore`, `collaborate`, `disease`, `safety`, `mental`, `outcome`
  - Invariant: All values are integers in [0, 100]. Computed, never stored.
  - Formula: `Math.round(sum(points) / (3 × nonNaCount) × 100)`. If `nonNaCount === 0`, value is `0`.

- **QuestionCategory**: Enum of five categories that partition all Questions.
  - Values: `Collaborate`, `Disease`, `Safety`, `Mental`, `Outcome`
  - Used to group Answers for per-category score calculation.

---

### Aggregates

- **ScoreReport** (Aggregate Root): The complete computed result for one Cover.
  - Members: Cover identity fields (`coverId`, `enrollId`, `coverStatus`) + Factory identity fields (`factoryId`, `factoryNameTh`) + `ScoreBreakdown`
  - Invariants:
    - Must reference a valid Cover with status `in_review` or `finished`
    - All six score fields must be present (no partial reports)
    - `totalScore` is computed from ALL non-n/a answers, not the average of category scores
  - Lifecycle: Computed on-demand, never persisted. Discarded after response is sent.

---

### Domain Events

None. This is a read-only, query-side feature. No state changes occur, therefore no domain events are triggered.

---

### Domain Services

- **ScoreCalculationService**: Computes a `ScoreBreakdown` from a set of `(Answer, Question)` pairs.
  - Operation: `calculateBreakdown(answers: AnswerWithCategory[]) → ScoreBreakdown`
  - Dependencies: `ChoicePoints` value object
  - Rules:
    - Filters out `n/a` answers per category and overall
    - Applies formula: `Math.round(sum / (3 × count) × 100)` per group
    - Returns zeros for empty groups

- **ScoreQueryService**: Resolves the correct set of Covers for a given role scope, then computes Score Reports.
  - Operations:
    - `getScoreByFactory(factoryId) → ScoreReport | Error`
    - `getScoresByRegion(region) → ScoreReport[]`
    - `getScoresByProvince(provinceId) → ScoreReport[]`
    - `getAllScores(filters?: { region?, provinceId? }) → ScoreReport[]`
  - Dependencies: `ScoreCalculationService`, DB (read-only)
  - Rules:
    - All queries scoped to current fiscal year via `getFiscalYear()`
    - List queries silently omit Covers with `in_progress` status (no error for lists)
    - Single-factory query returns 400 if cover is `in_progress`, 404 if no cover exists

---

### Repository Interfaces

- **IScoreRepository**: Read-only data access contract for scoring queries.
  - `findCoverWithStatusByFactory(factoryId, fiscalYear) → CoverWithStatus | null`
  - `findAnswersWithCategoryByCover(coverId) → AnswerWithCategory[]`
  - `findReadyCoversByRegion(region, fiscalYear) → CoverWithFactoryInfo[]`
  - `findReadyCoversByProvince(provinceId, fiscalYear) → CoverWithFactoryInfo[]`
  - `findAllReadyCovers(filters, fiscalYear) → CoverWithFactoryInfo[]`
  - Note: "Ready" means status `in_review` or `finished`. Implementation uses Drizzle ORM JOIN queries.

---

### Ubiquitous Language

- **Score**: A rounded integer (0–100) representing the percentage of maximum achievable points a factory earned on their Cover's Answers.
- **ScoreReport**: The full output for one Cover: factory identifiers + cover context + ScoreBreakdown.
- **ScoreBreakdown**: The six-field value object containing `totalScore` and one score per QuestionCategory.
- **ChoicePoints**: The fixed mapping from a `selectedChoice` string to its numeric point value.
- **Cover**: The assessment instance — one per factory enrollment per fiscal year.
- **Ready Cover**: A Cover whose latest CoverLog status is `in_review` or `finished` (eligible for scoring).
- **QuestionCategory**: One of the five dimensions (`Collaborate`, `Disease`, `Safety`, `Mental`, `Outcome`) that partition Questions.
- **CoverScope**: The access boundary for a user role — own (Factory), by region (Evaluator), by province (Provincial Officer), all (Admin).
- **Fiscal Year**: The Oct 1 – Sep 30 period used to scope all Cover/Enroll queries. Derived from `getFiscalYear()`.
