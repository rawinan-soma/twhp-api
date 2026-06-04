# Domain Context

## Glossary

### Cover
One assessment instance per factory enrollment per fiscal year. Created by the factory, progresses through statuses: `in_progress → in_review → finished`. A Cover is the unit of scoring.

### Score
A calculated metric for a Cover. Derived on-demand from the Cover's Answers — never persisted. Only available when the Cover's latest status is `in_review` or `finished`; requesting a score for an `in_progress` Cover returns an error.

**Formula:** `sum(choice_points) / (3 × non_na_count) × 100%`

| selectedChoice | Points |
|---------------|--------|
| `"3"` | 3 |
| `"2"` | 2 |
| `"1"` | 1 |
| `"0"` | 0 |
| `"n/a"` | excluded from numerator and denominator |

### Category Score
A Score scoped to one QuestionCategory (`Collaborate`, `Disease`, `Safety`, `Mental`, `Outcome`). Calculated using the same formula, restricted to answers whose question belongs to that category.

### Score Report
The full response object returned by the score endpoints. Contains:
- `factoryId`, `factoryNameTh`, `coverId`, `coverStatus`, `enrollId`
- `totalScore` — overall Score for the Cover
- Per-category scores: `collaborate`, `disease`, `safety`, `mental`, `outcome`

For list endpoints (Evaluator, Provincial Officer, Admin), the response is an array of Score Reports.

### Question
An assessment item with a `category` (QuestionCategory) and a `special` integer. The `special` field controls file-upload behavior only — it has no effect on scoring.

## Score Endpoints

| Role | Path | Scope |
|------|------|-------|
| Factory | `GET /twhp/api/factories/assessments/score` | Own Cover |
| Evaluator | `GET /twhp/api/evaluators/score` | All Covers in evaluator's region |
| Provincial Officer | `GET /twhp/api/provincialOfficers/score` | All Covers in officer's province |
| Admin (DOED) | `GET /twhp/api/admins/score` | All Covers (optional `?region=` / `?provinceId=` filters) |
