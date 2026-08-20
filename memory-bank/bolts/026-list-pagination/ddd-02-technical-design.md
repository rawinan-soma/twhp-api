---
unit: 001-list-pagination
bolt: 026-list-pagination
stage: design
status: complete
updated: 2026-08-20T00:00:00Z
---

# Technical Design - Enrollment List Pagination + Cover-Status Pushdown

## Architecture Pattern

**Pattern**: reuse bolt 025's shared module unchanged; replace one application-side helper with a
shared query-shape builder inside the existing enroll service.

No new module, no new layer, no new dependency. `src/schema/pagination.ts` is imported as-is —
`PaginationQuery`, `Paginated`, `resolvePage`, `buildPage` all apply without modification. That is
the return on having built the contract first and proved it on the simplest family.

The change here is confined to `src/service/enroll.ts`, where the three-query-plus-JavaScript-filter
shape becomes a two-query shape driven by one shared expression.

### Current shape (three queries, filter in memory)

```text
1. SELECT every matching Enrollment          ← unbounded
2. SELECT covers WHERE enrollId IN (all ids) ← unbounded
3. SELECT DISTINCT ON latest coverLog        ← unbounded
4. attach coverId/coverStatus in JavaScript
5. Array.filter(...)                          ← the filter, outside SQL
```

### Target shape (two queries, filter in SQL)

```text
buildEnrollQuery(scope, coverStatusFilter) ──┬──► count query ──► total
                                             └──► page query  ──► items
                                                  + ORDER BY enrollDate DESC, id DESC
                                                  + LIMIT / OFFSET
```

Both queries are produced from one builder, so they cannot drift. This is repository contract
obligation 1, and it is the obligation the current code cannot satisfy at all because it has no
count query.

## Layer Structure

```text
┌─────────────────────────────────────────────────────────┐
│  Presentation   src/routes/{admins,evaluators,           │
│                 provincialOfficers}/enrolls/index.ts     │
│                 • compose PaginationQuery                │
│                 • 200 → Paginated(EnrollWithCoverSelect) │
│                 • guards, coverStatus filter unchanged   │
├─────────────────────────────────────────────────────────┤
│  Application    src/service/enroll.ts                    │
│                 • buildEnrollQuery() — shared shape      │
│                 • coverStatusPredicate() — 4-value map   │
│                 • enrichAndFilterCovers() DELETED        │
├─────────────────────────────────────────────────────────┤
│  Domain         src/schema/pagination.ts (unchanged)     │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Drizzle / PostgreSQL                     │
│                 • LEFT JOIN covers                       │
│                 • LEFT JOIN LATERAL latest coverLog      │
│                 • no schema change, no migration         │
└─────────────────────────────────────────────────────────┘
```

## Cover-Status Resolution in SQL

The domain model's defining requirement was that latest-log-wins must be expressible as a predicate.
Three mechanisms were considered.

1 - **`LEFT JOIN LATERAL` with `ORDER BY id DESC LIMIT 1` (chosen).** Correlated, so it reads
    CoverLog rows only for Covers already in scope. Collapses the one-to-many relation to exactly one
    row before it can widen the result, satisfying INV-6. The joined alias is usable in both the
    `SELECT` projection and the `WHERE` clause, so one expression serves the projection, the filter,
    and the count — which is precisely obligation 1. Confirmed available in the installed
    `drizzle-orm@0.45` as `.leftJoinLateral()`.

2 - **`LEFT JOIN` against a `DISTINCT ON (cover_id)` subquery (rejected).** Also collapses correctly
    and is the pattern the current JavaScript mirrors. Rejected because the subquery is uncorrelated:
    it resolves the latest log for *every* Cover in the database on every request, including Covers
    outside the caller's fiscal year, region, or province. That is the same "compute everything,
    then discard" shape this intent exists to remove.

3 - **Correlated scalar subquery repeated in `SELECT` and `WHERE` (rejected).** PostgreSQL cannot
    reference a `SELECT` alias from `WHERE`, so the subquery must be written twice. Two copies of the
    latest-log rule is exactly the drift obligation 1 forbids.

### Query shape

```sql
FROM        enrolls e
INNER JOIN  factories f  ON f.account_id = e.factory_id
INNER JOIN  provinces p  ON p.province_id = f.province_id
LEFT  JOIN  covers c     ON c.enroll_id  = e.id
LEFT  JOIN  LATERAL (
              SELECT cl.status
              FROM   cover_logs cl
              WHERE  cl.cover_id = c.id
              ORDER  BY cl.id DESC
              LIMIT  1
            ) latest ON true
WHERE       <fiscal year> AND <scope> AND <coverStatusPredicate>
ORDER BY    e.enroll_date DESC, e.id DESC
LIMIT ? OFFSET ?
```

`c.id` is projected as `coverId`; `latest.status` as `coverStatus`. Both remain nullable, exactly as
today.

The Cover join is a plain `LEFT JOIN` and cannot multiply rows, because at most one Cover exists per
Enrollment. The CoverLog relation is one-to-many and *would* multiply — the `LIMIT 1` inside the
lateral is what prevents it. That single clause is what stops bolt 025's row-multiplication defect
reappearing here in a new form.

## Cover-Status Filter Mapping

The four filter values are **not** four comparisons. This table is the design's answer to the
domain model's highest-risk finding.

| `?coverStatus=` | SQL predicate | Meaning |
|---|---|---|
| *absent* | *(no predicate)* | every Enrollment in scope |
| `finished` | `latest.status = 'finished'` | test on the resolved status |
| `in_review` | `latest.status = 'in_review'` | test on the resolved status |
| `in_progress` | `latest.status = 'in_progress'` | test on the resolved status |
| `none` | **`c.id IS NULL`** | **absence of a Cover — not a status comparison** |

`none` must never be written as `latest.status IS NULL`. That expression would also match an
Enrollment that *has* a Cover which has no CoverLog yet — a different population. The two null
sources the domain model separated are separated here, in the one place it matters.

## Shared Module: `src/service/coverStatus.ts` (NEW)

Bolt 027 needs the identical latest-log-wins resolution for Score Reports. An instruction telling it
to "reuse the pattern" is a hope, not a guarantee — two bolts writing the same correlated subquery
independently is how two subtly different definitions of "current status" enter one codebase.

This bolt therefore **extracts the resolution into a shared module that bolt 027 must import.** The
coupling is enforced by code rather than by a note.

### Why a new module rather than exporting from `enroll.ts`

`src/service/enroll.ts` is an enrollment-domain service. A score-domain service importing from it
would create a dependency that has nothing to do with either domain — the shared thing is a *Cover*
concept, not an enrollment one. `src/service/scoreHelpers.ts` is the existing precedent in this
codebase for a small, dependency-free helper module extracted out of a service.

### Exports

| Export | Kind | Purpose |
|--------|------|---------|
| `latestCoverLogLateral(database)` | Query builder | The correlated subquery resolving a Cover's current status, aliased for a `LEFT JOIN LATERAL`. Correlates on `covers.id`. |
| `LATEST_COVER_LOG_ALIAS` | Constant | The alias name, so callers reference one string |
| `CoverStatusValue` | Type | `"in_progress" | "in_review" | "finished"` |

### Contract

- The subquery orders by `coverLogs.id` **descending** and takes `LIMIT 1`. Both are part of the
  contract, not incidental: `id` ordering is the latest-log-wins rule from intents 007 and 011, and
  `LIMIT 1` is what prevents a one-to-many relation from multiplying the outer result (INV-6).
- It correlates on `covers.id`, so every caller must have joined `covers` before lateral-joining it.
- It resolves status and nothing else. It does **not** filter. Each caller writes its own predicate
  on the resolved alias, because their filters genuinely differ: this bolt maps four enrollment
  filter values including the `none` absence test, while bolt 027 selects the scorable set
  (`in_review` and `finished`). Pushing both into the shared module would couple the two bolts'
  *policies* rather than their *mechanism*, which is not the goal.

### What is shared and what is not

| Concern | Shared | Owner |
|---------|--------|-------|
| How current status is resolved | ✅ yes | `coverStatus.ts` |
| That resolution collapses to one row | ✅ yes | `coverStatus.ts` |
| Which statuses a caller selects | ❌ no | each caller |
| The `none` absence test | ❌ no | this bolt only |

**Bolt 027 must import `latestCoverLogLateral` and must not write its own correlated subquery over
`coverLogs`.** That is a review gate for bolt 027, recorded in its bolt file.

## API Design

Three endpoints change. Guards, the `coverStatus` filter vocabulary, scoping, and item projections
are untouched.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/twhp/api/admins/enrolls` | GET | `coverStatus?`, `page?`, `limit?` | `200 Paginated(EnrollWithCoverSelect)` |
| `/twhp/api/evaluators/enrolls` | GET | `coverStatus?`, `page?`, `limit?` | `200 Paginated(EnrollWithCoverSelect)`, `404 { message }` |
| `/twhp/api/provincialOfficers/enrolls` | GET | `coverStatus?`, `page?`, `limit?` | `200 Paginated(EnrollWithCoverSelect)`, `404 { message }` |

`EnrollWithCoverListSchema` in `src/schema/enroll.ts` becomes `Paginated(EnrollWithCoverSelect)`.
The item schema `EnrollWithCoverSelect` is **not** modified — same base Enrollment columns, same
joined `factory_name_th`, `region`, `provinceId`, same nullable `coverId` and `coverStatus`.

Query composition follows bolt 025:

```text
query: t.Composite([t.Object({ coverStatus: CoverStatusQuery }), PaginationQuery])
```

## Data Persistence

**No schema change. No Drizzle migration. No new table or column.**

### Ordering

`enrollDate` descending, then `enrolls.id` descending. The primary direction is unchanged so the
visible list order does not change for staff; the `id` tiebreaker is added because `enrollDate` is
not unique and offset pagination over a non-total order is incorrect (ADR 0009). `id` is the
Enrollment primary key, so the combined ordering is total.

`id DESC` rather than `ASC` so that, among Enrollments sharing a date, the more recently created
appears first — consistent with the newest-first intent of the primary sort.

### Index considerations

The lateral subquery orders `cover_logs` by `id` within a `cover_id`. An index on
`(cover_id, id DESC)` would serve it directly. Whether one already exists must be checked with
`EXPLAIN ANALYZE` in Stage 5. **Any index addition is raised for human review, never migrated inside
a bolt** — the intent's technical constraints require this.

### Count query

Identical `FROM`/`JOIN` chain and identical `WHERE`, differing only in projecting `count()` and
omitting `ORDER BY`/`LIMIT`/`OFFSET`. Built from the same builder so divergence is structurally
impossible rather than merely discouraged.

The lateral join is retained in the count even when no status filter is applied. It costs one
correlated lookup per counted row in that case. This is accepted deliberately: a conditional join
chain would create two code paths whose predicates could diverge, which is the exact failure
obligation 1 exists to prevent. If Stage 5 measurement shows the cost is material, the optimisation
is to drop the lateral from *both* queries when no status filter is present — never from one.

## Security Design

| Concern | Approach |
|---------|----------|
| Authentication | Unchanged — cookie JWT via `jwtPlugin` |
| Authorization | Unchanged — `adminGuard`, `evalGuard`, `officerGuard` |
| Scope enforcement | Fiscal-year, region, and province predicates stay in the same shared `WHERE` clause, so they apply to the count and the page identically. A caller cannot reach another region's Enrollments through `page` or `limit`. |
| Resource exhaustion | `limit` capped at 100 by schema validation before any query runs |
| Data exposure | Enrollment items carry eleven standard-certificate URL columns. Bounding the row count reduces how much of that is emitted per request. No field is added. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| Bounded payload | `LIMIT` in SQL; `limit` ceiling 100 |
| Query count | **Three unbounded queries become two bounded ones** |
| Bounded memory | No intermediate array of every Enrollment; no `Map` of every Cover |
| Correct `total` | Count and page share one predicate — restores INV-3 on a path that could not satisfy it |
| Page stability | Total order `enrollDate DESC, id DESC` |
| Item contract stability | `EnrollWithCoverSelect` reused verbatim |
| Latency | `EXPLAIN ANALYZE` before and after required in Stage 5 |

## Error Handling

No new error path. Services keep returning `status(code, body)` and never throw.

| Error Type | Code | Response |
|------------|------|----------|
| `page`/`limit` out of bounds or non-numeric | 400 | Global `onError` maps `VALIDATION` → 400 |
| `coverStatus` outside the four literals | 400 | Existing `CoverStatusQuery` union, unchanged |
| Evaluator resolves no region | 404 | `{ message: "invalid evaluator" }`, unwrapped |
| Provincial officer not found | 404 | `{ message }`, unwrapped |
| Page beyond the last page | **200** | Empty `items`, accurate `meta` (INV-4) |

## Files Changed

| File | Change |
|------|--------|
| `src/service/coverStatus.ts` | **New.** `latestCoverLogLateral`, `LATEST_COVER_LOG_ALIAS`, `CoverStatusValue`. Imported by this bolt and, mandatorily, by bolt 027. |
| `src/service/enroll.ts` | `enrichAndFilterCovers` **deleted**; `buildEnrollQuery` + `coverStatusPredicate` added; `getAllEnrolls` and `getAllEnrollsByProvince` become count + page + `buildPage` |
| `src/schema/enroll.ts` | `EnrollWithCoverListSchema` → `Paginated(EnrollWithCoverSelect)`; item schema unchanged |
| `src/routes/admins/enrolls/index.ts` | compose `PaginationQuery`; `200` → envelope |
| `src/routes/evaluators/enrolls/index.ts` | same |
| `src/routes/provincialOfficers/enrolls/index.ts` | same |

Six files: one new, five modified. No route added, removed, or renamed.

## ⚠ Finding to confirm in Stage 4

`src/service/enroll.ts` appears to contain a `getAllEnrollsByRegion` function that returns Enrollment
rows **without** cover enrichment, while the evaluator route reaches the same data by calling
`getAllEnrolls(region, undefined, coverStatus)`. If `getAllEnrollsByRegion` has no caller, it is dead
code that will silently retain the old unpaginated, unfiltered shape after this bolt lands — a trap
for the next contributor who finds it and assumes it is current.

Stage 4 must confirm whether it has any caller, and then either paginate it for consistency or
delete it. It must not be left in an inconsistent state. This is recorded now so the decision is
deliberate rather than discovered.

## Open Decisions Carried to Stage 3

1 - **The `LEFT JOIN LATERAL` latest-log-wins pattern as a standing convention.** Now partly settled
    by extracting `src/service/coverStatus.ts`, which makes reuse structural rather than advisory. An
    ADR would still add value by recording *why* the lateral form was chosen over the uncorrelated
    `DISTINCT ON` alternative, and by stating that any future latest-log-wins query must import the
    helper rather than rewrite it. Likely ADR-worthy.

2 - **Deleting `enrichAndFilterCovers` rather than keeping it as a fallback.** Bolt 025 kept nothing
    behind; here the parity risk is higher because the filter semantics are subtler. Whether the old
    helper survives until the parity tests pass is a decision worth making explicitly.

## Verification Obligations Handed to Stages 4 and 5

- Prove membership parity against the current implementation for all five filter states —
  `finished`, `in_review`, `in_progress`, `none`, and absent — before deleting the JavaScript path.
- Seed the two distinct null sources separately: an Enrollment with no Cover, and an Enrollment whose
  Cover has no CoverLog. Without both, the `none` predicate is untested.
- Seed a Cover with multiple CoverLogs where the greatest `id` has an *earlier* timestamp, proving
  ordering is by `id`.
- Seed two Enrollments sharing an `enrollDate` to prove the tiebreaker.
- Confirm exactly one row per Enrollment (INV-6) with a multi-log Cover present.
- `EXPLAIN ANALYZE` the count and page queries; report whether an index on `cover_logs (cover_id, id)`
  is needed.
