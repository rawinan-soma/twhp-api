---
stage: design
bolt: 005-score-service
created: 2026-06-12T10:25:00Z
---

## Technical Design: score-service (FR-9 breakdown restructure)

### Architecture Pattern

No new pattern. Reuse the existing service-factory + on-demand calculation pattern (ADR 0001). The change is confined to three files across the existing layers; no DB, no new dependency, no migration. The `Score Group` value object is realised as a plain TypeScript object (the codebase favours plain shapes + TypeBox validation over classes).

### Layer Structure

```text
┌─────────────────────────────┐
│ Presentation                │ 4 route files — response schema swap only
├─────────────────────────────┤
│ Application / Domain Service │ score.ts (assembly) + scoreHelpers.ts (calculator)
├─────────────────────────────┤
│ Infrastructure              │ unchanged — same Drizzle reads
└─────────────────────────────┘
```

### Change set (3 files)

1. **`src/service/scoreHelpers.ts`** — the calculator.
   - Add a return type: `type ScoreGroup = { scoredCount: number; maxScore: number; achievedScore: number; percentage: number }`.
   - Change `scoreGroup(items)` to return a `ScoreGroup` instead of a bare number. It already computes `valid` (non-`n/a`) and `sum`; derive:
     - `scoredCount = valid.length`
     - `achievedScore = sum`
     - `maxScore = 3 * valid.length`
     - `percentage = valid.length === 0 ? 0 : Math.round((sum / (3 * valid.length)) * 100)`
     - Empty group returns `{ scoredCount: 0, maxScore: 0, achievedScore: 0, percentage: 0 }`.
   - Change `calculateBreakdown(items)` to return `{ total, collaborate, disease, safety, mental, outcome }` where each value is the `ScoreGroup` from `scoreGroup(...)` over the (category-filtered) slice. `total = scoreGroup(items)`.

2. **`src/service/score.ts`** — assembly.
   - `getScoreByFactory`: replace `...calculateBreakdown(...)` spread with `scoring: calculateBreakdown(...)`.
   - `buildScoreReports`: same swap inside the `readyCovers.map(...)` — `scoring: calculateBreakdown(answersByCover.get(c.coverId) ?? [])`.
   - `factoryId/factoryNameTh/coverId/coverStatus/enrollId` remain top-level. No query change (answers + category already selected).
   - Re-export of `scoreGroup`/`calculateBreakdown` stays valid (signatures change, names don't).

3. **`src/schema/score.ts`** — response contract (breaking).
   - Add `const ScoreGroupSchema = t.Object({ scoredCount: t.Integer({ minimum: 0 }), maxScore: t.Integer({ minimum: 0 }), achievedScore: t.Integer({ minimum: 0 }), percentage: t.Integer({ minimum: 0, maximum: 100 }) })`.
   - Rewrite `ScoreReportSchema`: keep `factoryId, factoryNameTh, coverId, coverStatus, enrollId`; **remove** `totalScore, collaborate, disease, safety, mental, outcome`; add `scoring: t.Object({ total: ScoreGroupSchema, collaborate: ScoreGroupSchema, disease: ScoreGroupSchema, safety: ScoreGroupSchema, mental: ScoreGroupSchema, outcome: ScoreGroupSchema })`.
   - `ScoreReportListSchema = t.Array(ScoreReportSchema)` unchanged.

### API Design

All four endpoints keep their paths, methods, guards, and status codes. Only the success-body shape changes:

- `GET /twhp/api/factories/assessments/score` → single `ScoreReport` with `scoring`.
- `GET /twhp/api/evaluators/score` · `GET /twhp/api/provincialOfficers/score` · `GET /twhp/api/admins/score` → `ScoreReport[]`.
- `400` (in_progress) and `404` (no cover) on the factory endpoint unchanged (FR-3 guard untouched).

Response example (single):

```jsonc
{
  "factoryId": 42, "factoryNameTh": "…", "coverId": 7, "coverStatus": "finished", "enrollId": 15,
  "scoring": {
    "total":       { "scoredCount": 50, "maxScore": 150, "achievedScore": 120, "percentage": 80 },
    "collaborate": { "scoredCount": 10, "maxScore": 30,  "achievedScore": 22,  "percentage": 73 }
    // disease, safety, mental, outcome …
  }
}
```

### Data Model

No change. No tables, columns, or migrations. Reads are identical (`answers ⋈ questions.category`, plus cover/enroll/factory/province joins for scoping).

### Security Design

Unchanged — same `factoryGuard`/`evalGuard`/`officerGuard`/`adminGuard`; no new data exposed (count/max/achieved are derived from data the caller already receives).

### NFR Implementation

- **Performance**: no extra queries; the new fields come from values already computed in-memory. p95 < 300ms target unaffected.
- **Compatibility (breaking)**: flat fields removed. Frontend + any consumer must migrate to `scoring.<group>.percentage`. `score.test.ts` and `score.integration.test.ts` assert the flat shape and will be rewritten in Stage 5.

### Risks / edge handling

- Divide-by-zero on empty group — guarded by the `valid.length === 0` branch returning all-zeros.
- Rounding parity — `percentage` reuses the exact existing `Math.round(... × 100)` expression so values match the old output bit-for-bit.
