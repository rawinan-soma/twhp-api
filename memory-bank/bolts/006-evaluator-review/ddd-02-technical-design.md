---
stage: technical-design
bolt: 006-evaluator-review
created: 2026-06-17T00:00:00Z
---

## Technical Design: Evaluator Review — Foundation (006-evaluator-review)

> Scope: schema additions + level→category access map. No new endpoints in this bolt.

---

### Architecture Pattern

**Layered Architecture (existing project pattern)** — no new pattern introduced.

This bolt touches three layers:
1. **Infrastructure** (`src/drizzle/schema.ts`) — two additive DB changes
2. **Schema/DTO** (`src/schema/`) — TypeBox regeneration + Score Report `grade` field
3. **Service** (`src/service/evaluator.ts`) — `CATEGORIES_FOR_LEVEL` constant + `categoriesFor` helper

No route layer changes — this bolt produces zero new endpoints.

---

### Layer Structure

```text
┌──────────────────────────────────────────────────┐
│ Presentation   │  src/routes/  (unchanged)        │
├──────────────────────────────────────────────────┤
│ Application    │  src/service/evaluator.ts        │
│                │  + categoriesFor(level) helper   │
│                │  + CATEGORIES_FOR_LEVEL const    │
├──────────────────────────────────────────────────┤
│ Domain         │  src/schema/score.ts (grade)     │
│                │  src/schema/evaluator.ts (ACs)   │
├──────────────────────────────────────────────────┤
│ Infrastructure │  src/drizzle/schema.ts           │
│                │  verdict_choice col + recommended│
└──────────────────────────────────────────────────┘
```

---

### API Design

No new endpoints in this bolt. All data contracts here are internal:

- `categoriesFor(level)` → `string[]` — used by future verdict/answer endpoints (bolts 007, 008)
- Score Report `grade` field → added to existing `GET /twhp/api/score/:coverId` response schema

---

### Data Model

#### Change 1 — `answerLogs.verdict_choice` (new nullable column)

```text
answerLogs table:
  + verdict_choice  choices (pgEnum, nullable)
                    Constraint: app layer must reject 'n/a'; only 0/1/2/3 written.
```

- Reuses the existing `choices` pgEnum (`'0'|'1'|'2'|'3'|'n/a'`).
- App-layer validation (TypeBox) restricts writes to `'0'|'1'|'2'|'3'`.
- Null = no score verdict recorded yet (description-only log, or not yet reviewed).

#### Change 2 — `answerStatus` pgEnum (additive: `recommended`)

```text
answerStatus enum (was 3 values):
  in_review  →  existing
  rejected   →  existing
  finished   →  existing
+ recommended →  NEW — provisional tier-1 approval, ODPC-overridable
```

- Migration: `db:push` adds the enum value non-destructively (Drizzle handles `ALTER TYPE ADD VALUE`).
- No existing rows need back-fill; current `in_review`/`rejected`/`finished` values are unaffected.
- **Audit required**: every TypeScript `switch`/`if` on `answerStatus` must be updated to handle `recommended`.

#### Change 3 — Score Report `grade` (TypeBox schema only, no DB column)

```text
ScoreReport response schema:
  + grade  'gold'|'silver'|'certificate'|'joined'|null  (optional/nullable)
```

- Computed at finalization time; not persisted as a column.
- Null until Cover reaches `finished`.
- Added to the existing TypeBox response type in `src/schema/score.ts` (or wherever the Score Report response is defined).

---

### `categoriesFor` Helper Design

```typescript
// Typed constant keyed by EvaluatorLevel enum
const CATEGORIES_FOR_LEVEL: Record<EvaluatorLevel, string[]> = {
  Mental: ['Mental'],
  DOH:    ['Disease', 'Safety'],
  ODPC:   ['Collaborate', 'Disease', 'Safety', 'Mental', 'Outcome'],  // all 5
}

// Pure helper — no DB access
function categoriesFor(level: EvaluatorLevel): string[] {
  return CATEGORIES_FOR_LEVEL[level]
}
```

- Lives in `src/service/evaluator.ts` (co-located with evaluator service; exported for use by verdict/answer endpoints).
- Alternatively, may be extracted to `src/utils.ts` or a dedicated `src/service/evaluatorReview.ts` if the evaluator service grows too large — decision deferred to Stage 4 based on existing file size.

---

### `answerStatus` Audit Plan

The following files are expected to switch/compare on `answerStatus` and must be audited during Stage 4:

| Area | Why |
|------|-----|
| `src/service/answer.ts` | Answers file handling, status derivation |
| `src/service/score.ts` | Score guard that may skip non-finished answers |
| `src/service/cover.ts` (if exists) | Cover transition logic |
| `src/routes/` evaluator/factory routes | Status-based response shaping |
| `src/schema/index.ts` or schema files | TypeBox literal unions referencing status |

Each switch/conditional must explicitly handle `recommended` — either with a case, an exhaustive-check, or an explicit comment if the value is intentionally ignored.

---

### Security Design

- No new attack surface (no new routes).
- `categoriesFor` is a pure function — no injection risk.
- TypeBox schema validation for `verdict_choice` at app layer prevents `n/a` from reaching the DB (enforced in verdict endpoint, bolt 008 — noted here as a contract).

---

### NFR Implementation

| Requirement | Design Approach |
|-------------|----------------|
| Migration safety | `db:push` adds `verdict_choice` (nullable → no back-fill) + adds enum value (non-destructive `ALTER TYPE ADD VALUE`) |
| Zero downtime on enum add | PostgreSQL `ALTER TYPE ADD VALUE` does not lock existing rows |
| Backward compatibility | `verdict_choice` is nullable; all existing rows remain valid |
| Single source of truth for category map | One typed constant in service layer; never duplicated in route layer |

---

### Dependency on Existing Code

- `choices` pgEnum: already in `src/drizzle/schema.ts` — `verdict_choice` reuses it.
- `evaluatorLevels` pgEnum (or equivalent TS type): used as key type for `CATEGORIES_FOR_LEVEL`.
- `getEvaluatorData` helper: already in `evaluatorService` — no changes needed in this bolt.
- Score Report response type: extended with `grade`; Score Report query logic itself is untouched.

---

### Files to Change (Stage 4 Target List)

| File | Change |
|------|--------|
| `src/drizzle/schema.ts` | Add `verdict_choice` to `answerLogs`; add `'recommended'` to `answerStatus` enum |
| `src/schema/index.ts` | Regenerate / confirm base TypeBox types pick up schema changes |
| `src/schema/score.ts` (or score response file) | Add `grade` optional field to Score Report response TypeBox type |
| `src/service/evaluator.ts` | Add `CATEGORIES_FOR_LEVEL` constant + `categoriesFor` export |
| Audit files (TBD) | Update all `answerStatus` switches to handle `recommended` |
