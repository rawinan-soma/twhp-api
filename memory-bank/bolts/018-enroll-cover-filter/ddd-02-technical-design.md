---
stage: design
bolt: 018-enroll-cover-filter
created: 2026-06-24T06:44:19Z
---

## Technical Design: enroll-cover-filter

### Architecture Pattern

**Extend-in-place, layered (route → service → Drizzle).** No new architectural
pattern — follow the existing TWHP layering. The cover-enrichment logic is added
to the **service layer** (`src/service/enroll.ts`) as a private helper reused by
the existing list methods, so the three routes stay thin and the enrichment is
written once. Mirrors the proven read-side aggregation in
`src/service/score.ts` (`buildScoreReports`: fetch ids → fetch latest statuses →
map in JS, no N+1).

### Layer Structure

```text
┌─────────────────────────────┐
│ Presentation (routes)       │ 3 enroll route files: add `coverStatus` query param,
│                             │ pass to service, declare shared response schema
├─────────────────────────────┤
│ Application/Domain (service)│ enroll.ts: getAllEnrolls / getAllEnrollsByProvince
│                             │ + private enrichAndFilterCovers() helper
├─────────────────────────────┤
│ Infrastructure (Drizzle)    │ existing enroll query + 2 read queries:
│                             │ covers-by-enrollId, latest coverLogs (selectDistinctOn)
└─────────────────────────────┘
```

### Layer Responsibilities

- **Route**: parse + validate `coverStatus` (TypeBox enum → 400 on invalid), resolve caller scope (existing JWT logic), call the service, return the shared schema. No business logic.
- **Service**: run the existing scoped enroll query, then `enrichAndFilterCovers(rows, coverStatus)`; return enriched (+ optionally filtered) rows preserving order.
- **Infrastructure**: two bounded read queries keyed by the enroll set.

### Service API (signatures)

- `getAllEnrolls(region?: number, provinceId?: number, coverStatus?: CoverStatusFilter)`
  - Used by **admin** (`getAllEnrolls(undefined, undefined, coverStatus)`) and **evaluator** (`getAllEnrolls(region, undefined, coverStatus)`).
  - 3rd positional param chosen to keep the existing `getAllEnrolls(region)` evaluator call valid with zero churn.
- `getAllEnrollsByProvince(provinceId: number, coverStatus?: CoverStatusFilter)`
  - Used by **provincial** (`getAllEnrollsByProvince(provinceId, coverStatus)`).
- `CoverStatusFilter = 'finished' | 'in_progress' | 'in_review' | 'none'`.
- **`getAllEnrollsByRegion` is left untouched** — it is not wired to any current route (the evaluator route uses `getAllEnrolls(region)`). Documented to avoid confusion.

### Private helper (shared, written once)

```ts
// pseudocode — applies to the rows already returned by the scoped enroll query
async function enrichAndFilterCovers(rows, coverStatus?) {
  if (rows.length === 0) return rows;                       // short-circuit: no extra queries
  const enrollIds = rows.map(r => r.id);

  // Query A: covers for these enrolls  → enrollId → coverId  (≤1 cover/enroll)
  const coverRows = await db.select({ id: covers.id, enrollId: covers.enrollId })
    .from(covers).where(inArray(covers.enrollId, enrollIds));
  const coverByEnroll = new Map(coverRows.map(c => [c.enrollId, c.id]));

  // Query B: latest coverLog per cover (latest-log-wins)  → coverId → status
  const coverIds = coverRows.map(c => c.id);
  const statusByCover = coverIds.length === 0 ? new Map() : new Map(
    (await db.selectDistinctOn([coverLogs.coverId], { coverId: coverLogs.coverId, status: coverLogs.status })
      .from(coverLogs).where(inArray(coverLogs.coverId, coverIds))
      .orderBy(coverLogs.coverId, desc(coverLogs.id)))
      .map(l => [l.coverId, l.status]));

  // Project
  let out = rows.map(r => {
    const coverId = coverByEnroll.get(r.id) ?? null;
    const coverStatusVal = coverId == null ? null : (statusByCover.get(coverId) ?? null);
    return { ...r, coverId, coverStatus: coverStatusVal };
  });

  // Filter (AND-combined with the scope already applied upstream)
  if (coverStatus === 'none')      out = out.filter(r => r.coverId === null);
  else if (coverStatus)            out = out.filter(r => r.coverStatus === coverStatus);
  return out;                                                // order preserved (desc enrollDate)
}
```

Both list methods append `await enrichAndFilterCovers(results, coverStatus)` before returning. Existing fiscal-year + region/province WHERE clauses are unchanged, so scope is applied **before** enrichment → the filter can only narrow within scope (FR-1 AND-composition).

### API Design

- `GET /twhp/api/admins/enrolls` — guard DOED. Query: `{ coverStatus?: 'finished'|'in_progress'|'in_review'|'none' }`. → `getAllEnrolls(undefined, undefined, coverStatus)`.
- `GET /twhp/api/evaluators/enrolls` — guard Evaluator (region from JWT). Query: same. → `getAllEnrolls(region, undefined, coverStatus)`.
- `GET /twhp/api/provincialOfficers/enrolls` — guard Provincial (province from JWT). Query: same. → `getAllEnrollsByProvince(provinceId, coverStatus)`.
- **Response (all three, shared schema)** — array of:
  - existing: `...BaseEnrollSelect`, `factory_name_th: string`, `region: number`, `provinceId: number`
  - new: `coverId: number | null`, `coverStatus: ('finished'|'in_progress'|'in_review') | null`
- Invalid `coverStatus` → `400` (TypeBox) before handler runs. Existing `404` paths (evaluator/provincial scope resolution) unchanged.

### Schema (TypeBox)

- Define once, e.g. in `src/schema/enroll.ts`:
  - `CoverStatusQuery = t.Optional(t.Union([t.Literal('finished'), t.Literal('in_progress'), t.Literal('in_review'), t.Literal('none')]))`
  - `EnrollWithCoverSelect = t.Composite([BaseEnrollSelect, t.Object({ factory_name_th: t.String(), region: t.Number(), provinceId: t.Number(), coverId: t.Nullable(t.Number()), coverStatus: t.Nullable(t.Union([t.Literal('finished'), t.Literal('in_progress'), t.Literal('in_review')])) })])`
- All three routes replace their inline `t.Composite([...])` with `t.Array(EnrollWithCoverSelect)` — removes existing per-route drift (FR-3 "one shared schema").

### Data Model

Read-only. Tables touched (SELECT only): `enrolls`, `factories`, `provinces` (existing join), plus `covers` and `coverLogs`. No migration, no writes, no schema.ts change. `coverStatus` literal set must stay in sync with the `coverStatus` pgEnum (`finished | in_progress | in_review`).

### Security Design

- No change to authn/authz: reuse `adminGuard` / `evalGuard` / `officerGuard`.
- Scope enforcement is unchanged and applied in SQL before enrichment, so the new filter cannot leak out-of-region/province enrolls (FR-1 last AC).
- No secrets/PII added to logs.

### NFR Implementation

- **No N+1**: exactly 2 extra queries regardless of enroll count (Query A, Query B), both `inArray` over the enroll set; empty enroll set → 0 extra queries. Matches `score.ts`.
- **Backward compatible**: when `coverStatus` is absent, no rows are filtered out; only the two additive nullable fields appear. Ordering `desc(enrolls.enrollDate)` preserved (map/filter keep order).
- **Consistency**: reuse `utilities().getFiscalYear()` (already in the methods) and the `selectDistinctOn(...).orderBy(coverId, desc(id))` idiom.

### Integration Points

| Integration | Type | Notes |
| ----------- | ---- | ----- |
| routes → enrollService | in-process | add 3rd/2nd arg `coverStatus` |
| enrollService → Postgres | Drizzle SELECT | +2 bounded read queries |

### Open Implementation Choices (resolved here, not ADR-worthy)

- **3rd positional param vs options object** → keep positional (minimises churn to the existing evaluator call). 
- **Filter in JS vs SQL** → JS, after enrichment (set is small, bounded by FY scope; mirrors `score.ts`; keeps `none`/null logic trivial).
- **Touch `getAllEnrollsByRegion`?** → no (unused by routes).

### Story Coverage

- **001** → `enrichAndFilterCovers` helper + both method signatures.
- **002** → `EnrollWithCoverSelect` + `CoverStatusQuery` shared schema.
- **003** → query param + service wiring across the 3 route files.
