---
unit: 001-list-pagination
bolt: 027-list-pagination
stage: design
status: complete
updated: 2026-08-20T02:43:08Z
---

# Technical Design - Score Report Pagination + Page-Scoped Answer Hydration

## Architecture Pattern

**Pattern**: split `buildScoreReports` at its phase boundary. Paginate phase 1; scope phase 2 to the
page. No new module, no new layer, no new dependency.

Both prior bolts' modules are imported unchanged:

- `src/schema/pagination.ts` (bolt 025) — `PaginationQuery`, `Paginated`, `resolvePage`, `buildPage`
- `src/service/coverStatus.ts` (bolt 026) — `latestCoverLogLateral`, **imported, never rewritten**

### Current shape — both phases sized by the whole population

```text
1. caller SELECTs every Cover in scope            ← unbounded
2. selectDistinctOn latest CoverLog for all of them ← unbounded
3. JavaScript removes in_progress                 ← the filter, outside SQL
4. SELECT every Answer of every survivor          ← ~123,000 rows nationwide
5. group into a Map, compute 3,000 reports
6. return 20
```

### Target shape — phase 1 paginated, phase 2 scoped to it

```text
buildCoverPredicate(scope) ──┬──► count query ──► total
                             └──► page query  ──► ≤ limit Covers
                                  + ORDER BY (total order)
                                  + LIMIT / OFFSET
                                        │
                                        ▼
                          hydrate(page's cover ids) ──► ~820 Answer rows
                                        │
                                        ▼
                          existing calculateBreakdown / computeGrade
```

The scoring code is not touched. Only the size of its input changes.

## Layer Structure

```text
┌─────────────────────────────────────────────────────────┐
│  Presentation   src/routes/{admins,evaluators,           │
│                 provincialOfficers}/score/index.ts       │
│                 • compose PaginationQuery                │
│                 • 200 → Paginated(ScoreReportSchema)     │
├─────────────────────────────────────────────────────────┤
│  Application    src/service/score.ts                     │
│                 • scorableCoverQuery() — shared shape    │
│                 • hydrateAnswers(coverIds) — phase 2     │
│                 • buildScoreReports() — compute only     │
├─────────────────────────────────────────────────────────┤
│  Domain         src/schema/pagination.ts    (bolt 025)   │
│                 src/service/coverStatus.ts  (bolt 026)   │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Drizzle / PostgreSQL                     │
│                 • no schema change, no migration         │
└─────────────────────────────────────────────────────────┘
```

## Phase 1 — Paginating Scorable Covers

Identical construction to bolt 026: one shared join chain feeding both a count and a page query, so
they cannot drift.

```sql
FROM        covers c
INNER JOIN  enrolls e    ON e.id = c.enroll_id
INNER JOIN  factories f  ON f.account_id = e.factory_id
INNER JOIN  provinces p  ON p.province_id = f.province_id
LEFT  JOIN  LATERAL (…latestCoverLogLateral…) latest ON true
WHERE       <fiscal year> AND <scope> AND latest.status IN ('in_review','finished')
ORDER BY    f.account_id ASC, c.id ASC
LIMIT ? OFFSET ?
```

### The scorable predicate

`inArray(latest.status, ["in_review", "finished"])`.

This is **this bolt's own policy**, deliberately not pushed into `coverStatus.ts`. ADR-0010 shares
the *mechanism* of resolving status; each caller keeps its own filter, because bolt 026 needs a
four-value map including a `none` absence test and this bolt needs a two-value set. Sharing the
policy would couple two things that genuinely differ.

An `in_progress` Cover, and a Cover with no CoverLog at all, are both excluded — matching current
behaviour, where `statusMap.get()` returns `undefined` and fails the `in_review`/`finished` check.

### Ordering — a decision, because there is none today

All three queries currently have **no `ORDER BY`**, so row order is undefined. Any choice is
therefore a change, and it should be a deliberate one.

**Chosen: `factories.accountId ASC, covers.id ASC`.**

- `accountId` matches the ordering the factory lists already use (bolt 025), giving one consistent
  ordering concept across the three families rather than three arbitrary ones.
- It is meaningful to a human scanning a list, unlike an internal cover id.
- `covers.id` is appended as a defensive tiebreaker. In principle `accountId` is already unique here
  — one Cover per Enrollment, one Enrollment per Factory per fiscal year — but that uniqueness is a
  consequence of business rules rather than a database constraint, and offset pagination breaks
  silently if it ever fails to hold.

Rejected: ordering by `factoryNameTh`, which is not unique and would need a tiebreaker anyway, and
sorts Thai text by collation rules that vary by database configuration.

## Phase 2 — Page-Scoped Hydration

```text
hydrateAnswers(coverIds: number[]) -> Map<coverId, AnswerWithCategory[]>
```

- Input is **the page's Cover ids only** — at most `limit` of them.
- Returns the existing `Map`, and callers keep the `?? []` default so a Cover with no Answers still
  produces a report with an empty breakdown (**INV-14**).
- Guards the empty list: an empty page issues **no** Answer query at all, preserving the existing
  `readyCovers.length === 0` early return.
- The query itself is unchanged — `answers` inner-joined to `questions`, filtered by
  `inArray(answers.coverId, ids)`. Only the size of `ids` changes.

### Why hydration is a Map lookup and not a join

Expressing phase 2 as a join from Cover to Answer would make it a **filter**: a Cover with zero
Answers would vanish between the count and the response. `items.length` would then disagree with the
`total` computed moments earlier, and the caller would see a short page with no error.

The current implementation already avoids this. The rewrite preserves the `Map` deliberately rather
than rediscovering the reason for it.

### Fan-out

| | Answer rows read |
|---|---|
| Today (3,000 scorable Covers) | ~123,000 |
| After, `limit=20` | ~820 |
| After, `limit=100` (maximum) | ~4,100 |

Bounded by `limit × questions-per-cover`, independent of the data set.

## API Design

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/twhp/api/admins/score` | GET | `region?`, `provinceId?`, `page?`, `limit?` | `200 Paginated(ScoreReportSchema)` |
| `/twhp/api/evaluators/score` | GET | `page?`, `limit?` | `200 Paginated(ScoreReportSchema)`, `404 { message }` |
| `/twhp/api/provincialOfficers/score` | GET | `page?`, `limit?` | `200 Paginated(ScoreReportSchema)`, `404 { message }` |

`ScoreReportListSchema` in `src/schema/score.ts` becomes `ScoreReportPageSchema = Paginated(ScoreReportSchema)`.
`ScoreReportSchema` itself is **not modified** — `factoryId`, `factoryNameTh`, `coverId`,
`coverStatus`, `enrollId`, nullable `grade`, nested `scoring` all unchanged.

`GET /factories/assessments/score` is **out of scope**: one Cover, one report, no pagination need.

## Data Persistence

**No schema change. No Drizzle migration.**

### ⛔ Index dependency inherited from bolt 026

This bolt uses the same lateral, so it needs the same index. Measured in bolt 026 against 3,000
enrollments:

| | Page | Count |
|---|---|---|
| Without `CoverLogs (cover_id, id DESC)` | 217 ms | 182 ms |
| With it | 2.5 ms | 2.3 ms |

`CoverLogs` currently has only a primary-key index on `id`. **This bolt does not create the index and
does not add a migration** — it is already an open human-review item from bolt 026. Recorded here so
the release gate is not counted once and forgotten: two bolts now depend on it.

## Security Design

| Concern | Approach |
|---------|----------|
| Authentication / Authorization | Unchanged — `adminGuard`, `evalGuard`, `officerGuard` |
| Scope enforcement | Fiscal-year, region and province predicates sit in the same shared `WHERE` as the scorable filter, so they apply to the count and the page alike |
| Reward disclosure | **INV-12 preserved**: `grade` non-null only for `finished` Covers, per intent `011` |
| Resource exhaustion | `limit` capped at 100 by schema; the fan-out cap follows from it |

## NFR Implementation

| Requirement | Approach |
|-------------|----------|
| Bounded Answer fan-out | Hydration receives at most `limit` Cover ids |
| Bounded memory | No Map of every Cover's Answers; no 3,000-report array built to return 20 |
| Query count | Three unbounded queries become **three bounded** ones: count, page, hydrate |
| Correct `total` | Count and page share one predicate |
| Page stability | Total order on `accountId, coverId` |
| Scoring fidelity | `calculateBreakdown`, `computeGrade`, choice-points map and special-question gate untouched |

## Error Handling

No new error path. Services keep returning `status(code, body)`.

| Error | Code | Response |
|-------|------|----------|
| `page`/`limit` invalid | 400 | Global `onError` maps `VALIDATION` → 400 |
| Evaluator resolves no region | 404 | Unwrapped, unchanged |
| Provincial officer not found | 404 | Unwrapped, unchanged |
| No scorable Cover in scope | **200** | `items: []`, `total: 0`, `totalPages: 0` |
| Page beyond the last | **200** | Empty page, accurate meta (INV-4) |

## Files Changed

| File | Change |
|------|--------|
| `src/service/coverStatus.ts` | `latestCoverLogFor(database, coverId)` added — the standalone shape. Existing `latestCoverLogLateral` unchanged. |
| `src/service/score.ts` | `buildScoreReports` split into `scorableCoverQuery` (phase 1), `hydrateAnswers` (phase 2) and a compute step; three list functions become count + page + hydrate + `buildPage`; `getScoreByFactory` migrates to `latestCoverLogFor` |
| `src/schema/score.ts` | `ScoreReportPageSchema` added; `ScoreReportSchema` unchanged |
| `src/routes/admins/score/index.ts` | compose `PaginationQuery`; `200` → envelope |
| `src/routes/evaluators/score/index.ts` | same |
| `src/routes/provincialOfficers/score/index.ts` | same |

Six files modified, none created. No route added, removed, or renamed.

## Review-Gate Conflict — RESOLVED (option 1)

Bolt 027's bolt file originally carried this gate:

> Reject this bolt at review if a second `coverLogs` ordering appears anywhere in `src/service/score.ts`.

`getScoreByFactory` — the single-Cover endpoint, outside this bolt's scope — already contained one. As
written, the gate rejected pre-existing code.

The underlying problem was the gate's wording, not the code. **The rule should name the source of
truth, not ban a SQL fragment**, because the two call sites legitimately need different SQL:

| Shape | Question | Form |
|-------|----------|------|
| **A — many Covers, in a list query** | "for *each* Cover in this list, what is its status?" | `LEFT JOIN LATERAL … ORDER BY id DESC LIMIT 1` — needs a Cover on its left to correlate against |
| **B — one known Cover** | "Cover 42 — what is its status?" | standalone `SELECT … WHERE cover_id = ? ORDER BY id DESC LIMIT 1` — no list, nothing to correlate |

Both express the same domain rule (greatest `id` wins). Only their SQL differs. A gate phrased against
the SQL therefore cannot be satisfied by correct code.

Note that **ADR-0010's own gate wording was already correct** — "a second `ORDER BY` over
`cover_logs` appearing anywhere *outside* `coverStatus.ts` should be rejected". Option 1 makes that
statement true for the first time; it was aspirational when written.

### Decision

`src/service/coverStatus.ts` gains a second export so the module owns **both** shapes:

| Export | Shape | Purpose |
|--------|-------|---------|
| `latestCoverLogLateral(database)` | A | Correlated subquery for list queries (existing, bolt 026) |
| `latestCoverLogFor(database, coverId)` | B | Standalone current-status read for one known Cover (**new**) |

`getScoreByFactory` migrates to `latestCoverLogFor`. Its behaviour is unchanged — same ordering, same
`LIMIT 1`, same `in_progress` guard and `400` response. Only the source of the rule moves.

Bolt 027's gate is reworded to:

> Reject if a Cover's current status is derived anywhere outside `src/service/coverStatus.ts`.

This is checkable without knowing which SQL shape a call site needs, and it survives a future third
shape.

### Scope note

This touches one function that has nothing to do with pagination. That is accepted deliberately: it
is the last remaining second definition of current status, and leaving it would mean shipping a gate
the codebase already violates. A rule people must mentally except is worse than no rule.

## Verification Obligations Handed to Stages 4 and 5

- **Output parity**: for the same data, Score, Category Scores and Grade per Cover identical to the
  current implementation. This is the primary assertion of the bolt.
- **INV-14**: seed a scorable Cover with **zero Answers** and prove it still appears on the page with
  an empty breakdown. Without this fixture, an accidental inner join passes every other test.
- **INV-12**: an `in_review` Cover on the page carries `grade: null`; a `finished` one carries its
  computed Grade.
- **Fan-out bound**: assert the Answer query receives at most `limit` Cover ids — ideally by counting
  queries or asserting on the id list, not by timing.
- **Exclusion**: `in_progress` Covers, and Covers with no CoverLog, absent from both `items` and `total`.
- **Page stability** across all pages with a fixed data set.
- **Empty page issues no Answer query.**
- `EXPLAIN ANALYZE` with and without the inherited index.
- **`getScoreByFactory` regression**: its behaviour must be identical after migrating to
  `latestCoverLogFor` — same status resolution, same `400` for an `in_progress` Cover, same report.
- **`latestCoverLogFor` needs its own tests**, like `latestCoverLogLateral` got in bolt 026: the
  module is now shared by three call sites across two services.
