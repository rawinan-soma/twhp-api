---
stage: design
bolt: 001-score-service
created: 2026-06-03T00:00:00Z
---

## Technical Design: Score Service

### Architecture Pattern

**Layer-based domain structure** — mirrors all existing services in the project. No new patterns introduced. The score feature is purely additive: a new service file + a new schema file, consumed by route files in bolt 002.

```text
┌──────────────────────────────────────┐
│  Route Layer (bolt 002)              │  src/routes/*/score/index.ts
│  Guards + endpoint wiring            │
├──────────────────────────────────────┤
│  Service Layer (this bolt)           │  src/service/score.ts
│  ScoreQueryService + calculation     │
├──────────────────────────────────────┤
│  Schema Layer (this bolt)            │  src/schema/score.ts
│  TypeBox ScoreReportSchema           │
├──────────────────────────────────────┤
│  Infrastructure (existing)           │  src/drizzle/ (no changes)
│  Drizzle ORM, PostgreSQL             │
└──────────────────────────────────────┘
```

---

### Files to Create

| File | Purpose |
|------|---------|
| `src/service/score.ts` | `createScoreService(db)` factory + `scoreService` singleton |
| `src/schema/score.ts` | `ScoreReportSchema` + `ScoreReportListSchema` TypeBox definitions |

**No changes to existing files** in this bolt. No schema.ts modifications.

---

### Service Design: `src/service/score.ts`

#### Internal helper — `calculateBreakdown`

Pure function, no DB access. Accepts pre-fetched answers with their question categories.

```typescript
type AnswerWithCategory = {
  selectedChoice: "0" | "1" | "2" | "3" | "n/a";
  category: "Collaborate" | "Disease" | "Safety" | "Mental" | "Outcome";
};

const CHOICE_POINTS: Record<string, number | null> = {
  "3": 3, "2": 2, "1": 1, "0": 0, "n/a": null,
};

function scoreGroup(answers: AnswerWithCategory[]): number {
  const valid = answers.filter(a => CHOICE_POINTS[a.selectedChoice] !== null);
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, a) => acc + (CHOICE_POINTS[a.selectedChoice] as number), 0);
  return Math.round((sum / (3 * valid.length)) * 100);
}

function calculateBreakdown(answers: AnswerWithCategory[]) {
  const byCategory = (cat: string) => answers.filter(a => a.category === cat);
  return {
    totalScore:  scoreGroup(answers),
    collaborate: scoreGroup(byCategory("Collaborate")),
    disease:     scoreGroup(byCategory("Disease")),
    safety:      scoreGroup(byCategory("Safety")),
    mental:      scoreGroup(byCategory("Mental")),
    outcome:     scoreGroup(byCategory("Outcome")),
  };
}
```

#### Service factory — `createScoreService(db)`

Exports four public methods matching the four role endpoints.

**`getScoreByFactory(factoryId: number)`**
1. Fetch current fiscal year cover for factory (JOIN enrolls → covers)
2. Fetch latest CoverLog status
3. If no cover → `status(404, { message: "cover not found" })`
4. If status is `in_progress` → `status(400, { message: "cover is not ready for scoring" })`
5. Fetch answers with question categories (JOIN answers → questions)
6. Call `calculateBreakdown(answers)`
7. Return ScoreReport object

**`getScoresByRegion(region: number)`**
1. Fetch all factory+cover combos in region with `in_review`/`finished` status, current fiscal year
2. For each cover, fetch answers with categories
3. Return array of ScoreReport objects (empty array if none)

**`getScoresByProvince(provinceId: number)`**
Same shape as `getScoresByRegion`, filtered by `provinceId`.

**`getAllScores(filters?: { region?: number; provinceId?: number })`**
Same shape, with optional filters applied. No filter = all covers.

---

### DB Query Strategy

**Single factory query** (`getScoreByFactory`):
```sql
-- Step 1: Find cover + status
SELECT covers.id AS coverId, covers.enrollId, coverLogs.status AS coverStatus
FROM covers
JOIN enrolls ON enrolls.id = covers.enrollId
LEFT JOIN LATERAL (
  SELECT status FROM coverLogs
  WHERE coverId = covers.id
  ORDER BY id DESC LIMIT 1
) AS coverLogs ON true
WHERE enrolls.factoryId = $factoryId
  AND enrolls.enrollDate >= $fiscalStart
  AND enrolls.enrollDate < $fiscalEnd
LIMIT 1;

-- Step 2: Fetch answers with category
SELECT answers.selectedChoice, questions.category
FROM answers
JOIN questions ON questions.id = answers.questionId
WHERE answers.coverId = $coverId;
```

**List queries** (`getScoresByRegion` / `getScoresByProvince` / `getAllScores`):
```sql
-- Fetch all ready covers with factory info in scope
SELECT
  covers.id AS coverId,
  covers.enrollId,
  enrolls.factoryId,
  factories.nameTh AS factoryNameTh,
  latest_log.status AS coverStatus
FROM covers
JOIN enrolls ON enrolls.id = covers.enrollId
JOIN factories ON factories.accountId = enrolls.factoryId
JOIN provinces ON provinces.provinceId = factories.provinceId
JOIN LATERAL (
  SELECT status FROM coverLogs
  WHERE coverId = covers.id
  ORDER BY id DESC LIMIT 1
) AS latest_log ON true
WHERE latest_log.status IN ('in_review', 'finished')
  AND enrolls.enrollDate >= $fiscalStart
  AND enrolls.enrollDate < $fiscalEnd
  -- AND provinces.healthRegion = $region   (for region filter)
  -- AND provinces.provinceId = $provinceId  (for province filter)
;
-- Then batch-fetch answers for all coverIds
```

**Implementation approach for list queries**: fetch all covers first, then batch-fetch all answers in one query using `inArray(answers.coverId, coverIds)`, group in memory, compute per cover. Avoids N+1.

---

### Schema Design: `src/schema/score.ts`

```typescript
import { t } from "elysia";

export const ScoreReportSchema = t.Object({
  factoryId:      t.Number(),
  factoryNameTh:  t.String(),
  coverId:        t.Number(),
  coverStatus:    t.String(),
  enrollId:       t.Number(),
  totalScore:     t.Integer({ minimum: 0, maximum: 100 }),
  collaborate:    t.Integer({ minimum: 0, maximum: 100 }),
  disease:        t.Integer({ minimum: 0, maximum: 100 }),
  safety:         t.Integer({ minimum: 0, maximum: 100 }),
  mental:         t.Integer({ minimum: 0, maximum: 100 }),
  outcome:        t.Integer({ minimum: 0, maximum: 100 }),
});

export const ScoreReportListSchema = t.Array(ScoreReportSchema);
```

---

### API Contracts (for bolt 002 reference)

| Method | Path | Guard | Service call | Response |
|--------|------|-------|-------------|----------|
| GET | `/twhp/api/factories/assessments/score` | `factoryGuard` | `scoreService.getScoreByFactory(id)` | `ScoreReportSchema` |
| GET | `/twhp/api/evaluators/score` | `evalGuard` | `scoreService.getScoresByRegion(region)` | `ScoreReportListSchema` |
| GET | `/twhp/api/provincialOfficers/score` | `officerGuard` | `scoreService.getScoresByProvince(provinceId)` | `ScoreReportListSchema` |
| GET | `/twhp/api/admins/score` | `adminGuard` | `scoreService.getAllScores({ region?, provinceId? })` | `ScoreReportListSchema` |

---

### Security Design

| Concern | Approach |
|---------|---------|
| Authentication | All endpoints require valid `Authentication` JWT cookie via `jwtPlugin` (applied globally in `src/index.ts`) |
| Authorization | Role guards pre-composed in `src/middleware/guards.ts` — use `factoryGuard`, `evalGuard`, `officerGuard`, `adminGuard` |
| Data scoping | Service methods take their scope parameter from the JWT-derived identity — callers cannot override scope |
| Read-only | All operations are SELECT queries — no mutation risk |

---

### NFR Implementation

| Requirement | Design Approach |
|-------------|----------------|
| p95 < 300ms | Batch-fetch answers in one `inArray` query for list endpoints; no N+1 queries |
| Correctness | Pure `calculateBreakdown` function — isolated, easy to unit-verify |
| No schema change | Read from existing tables only — zero migration risk |

---

### Integration Points

| Integration | Type | Notes |
|-------------|------|-------|
| `src/drizzle/schema.ts` | Read | Import `answers`, `questions`, `covers`, `coverLogs`, `enrolls`, `factories`, `provinces` |
| `src/drizzle/index.ts` | Read | Import `db` for `createScoreService(db)` |
| `src/utils.ts` | Read | Import `utilities().getFiscalYear()` |
| `src/middleware/guards.ts` | Read | Import guards for bolt 002 routes |
