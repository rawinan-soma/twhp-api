---
unit: 001-list-pagination
bolt: 026-list-pagination
stage: test
status: complete
updated: 2026-08-20T02:31:35Z
---

# Test Report - Enrollment List Pagination + Cover-Status Pushdown

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit (SQL-shape, no DB) | 17 | 0 | 0 | 100% of `src/service/coverStatus.ts` |
| Integration (DB-backed) | **18** | 0 | 0 | verified 2026-08-20 |
| Security | 2 | 0 | 0 | covered inside the unit suite |
| Performance | 0 | 0 | 0 | deferred — requires a database |
| **Total (this bolt)** | **35** | **0** | **0** | — |

Files:

- `src/service/coverStatus.test.ts` — **new**, 17 SQL-shape tests, no database required
- `src/service/enroll.integration.test.ts` — **adapted + extended**, 18 tests, all DB-backed

Whole suite moved from 114 pass to **131 pass**; skips and failures unchanged.

## UPDATE 2026-08-20 — the integration suite has now RUN, with one blocking finding

A disposable database was made available. **All 18 integration tests pass**, so every ⚠️ below that
reads "unverified" is now verified — membership parity across all five `coverStatus` states holds,
`none` correctly excludes the zero-log cover, the multi-log cover yields exactly one row, same-date
enrollments page stably, and `meta.total` reflects the filtered population.

One pre-existing defect had to be fixed before the suite could run at all: `beforeAll` borrowed a
district/subdistrict pair from an existing `Factories` row, silently assuming one existed. On a
freshly seeded database `Factories` is empty, so every test in the file died. It now derives the
pair from the reference tables, which are always seeded.

### ✅ RESOLVED 2026-08-20 — the index has been created

The index below was created on the database by the maintainer and verified: it exists, reports
`indisvalid = true`, and all four lateral queries now use it. Re-measured against 3,000 enrollments:

| Query | Without index | With index | Improvement |
|---|---|---|---|
| Enrollment page | 219.2 ms | **2.5 ms** | **87x** |
| Enrollment count | 185.9 ms | **2.4 ms** | **78x** |

Buffers fell 8x on both. The release gate recorded below is **cleared**.

### Original finding (superseded above): the lateral needs an index

`EXPLAIN ANALYZE` against 3,000 seeded enrollments (9,000 cover logs):

| | Page query | Count query | Buffers |
|---|---|---|---|
| **Current schema** (no index) | **217 ms** | **182 ms** | 71,324 |
| With `CoverLogs (cover_id, id DESC)` | **2.5 ms** | **2.3 ms** | 9,095 |
| Improvement | **86x** | **78x** | 8x |

`CoverLogs` currently has **only** a `btree (id)` primary-key index — nothing on `cover_id`. Without
one, the lateral's `where cl.cover_id = c.id order by cl.id desc limit 1` scans the primary-key index
backward for every candidate cover.

This is not a tuning nicety. At 3,000 enrollments the enrollment list takes over 200 ms per request;
production volume is worse. Bolt 026 fixes a memory problem and, without this index, introduces a
latency problem in its place.

**The index was created and dropped in the disposable database to produce these numbers. No schema
change is persisted, and none was made in the repository** — the intent's technical constraints
require index additions to go through human review. This is that review request, with evidence.

Recommended:

```sql
CREATE INDEX CONCURRENTLY idx_coverlogs_cover_id_id ON "CoverLogs" (cover_id, id DESC);
```

## Original section — integration tests were SKIPPED, not run (superseded above)

No database was reachable, exactly as in bolt 025. The 18 DB-backed tests are written,
type-checked and lint-clean, but **no assertion in them has executed**. Nothing about the enrollment
endpoints has been verified against a running system.

Unlike bolt 025, this bolt is not left with *nothing* verified — see the next section — but the
membership-parity claim itself remains unproven.

To run them:

```bash
docker compose --profile dev up --build
bun test src/service/enroll.integration.test.ts
```

## What WAS verified, without a database

`.toSQL()` compiles a Drizzle query without connecting. That makes the *shape* of the emitted SQL
testable everywhere, and shape is where this bolt's contractual decisions live. 17 tests assert it.

| Assertion | Why it matters |
|-----------|----------------|
| Emits `left join lateral`, not a plain join | The uncorrelated `DISTINCT ON` alternative is correct but unscoped (ADR-0010) |
| Correlates on `"CoverLogs"."cover_id" = "Covers"."id"` | This is what keeps the resolution scoped to the page |
| Orders by `"CoverLogs"."id" desc` | **This IS the latest-log-wins rule.** A future edit to a timestamp column fails here |
| The lateral subquery contains no timestamp column | Guards the same rule from the other direction |
| `order by … id desc limit $n` inside the lateral | `LIMIT 1` is the anti-multiplication control, not an optimisation |
| `coverStatus=finished` → `latest_cover_log.status = $n` | Positive filter tests the resolved column |
| **`coverStatus=none` → `"Covers"."id" is null`** | The single highest-risk decision in this bolt |
| **`none` does NOT emit `latest_cover_log.status is null`** | The plausible-but-wrong form, asserted against explicitly |
| No filter emits no cover-status predicate at all | Absent ≠ a fourth filter value |
| **Count and page emit an IDENTICAL where clause** | The invariant spanning two queries; if it breaks, `meta.total` describes a different population than `items` |
| Count query carries the same join chain | Inner-join exclusions must match between the two |
| `order by enroll_date desc, id desc` | The total order; without the unique tiebreaker OFFSET can repeat or skip rows |
| Page applies LIMIT/OFFSET; count applies neither | Prevents a count that silently counts one page |
| Count query is `select count(*)` | Counts rows, not a projection |

This is a genuinely useful safety net, but be clear about its limit: **it proves the query says what
we intended. It does not prove the query returns the right rows.**

## Acceptance Criteria Validation

### Story 005 — Cover-status SQL pushdown

| Criteria | Status |
|----------|--------|
| Status resolved in SQL by greatest `coverLogs.id`, not timestamp, not JavaScript | ✅ **verified** (SQL shape) |
| `none` is an absence test on the cover, not a status comparison | ✅ **verified** (SQL shape) |
| `finished`/`in_progress`/`in_review` return the same membership as the previous implementation | ⚠️ **unverified** — the parity assertions are in the skipped suite |
| `none` returns exactly the enrollments with no cover | ⚠️ **unverified** against data |
| Omitting the filter returns all in-scope enrollments with nullable projection | ⚠️ **unverified** against data |
| `meta.total` equals the filtered count | ⚠️ **unverified** against data |
| Multi-log cover resolves to the greatest-id row | ⚠️ **unverified** against data |
| Item shape unchanged field for field | ⚠️ **unverified** against data |

### Story 006 — Enrollment list pagination

| Criteria | Status |
|----------|--------|
| All three endpoints accept `page`/`limit` and return the envelope | ✅ by construction — shared schema from bolt 025, typecheck passes |
| Item keeps its existing fields | ✅ `EnrollWithCoverSelect` reused verbatim, unmodified |
| A filtered page holds up to `limit` rows, not shortened by post-query filtering | ⚠️ **unverified** against data |
| Evaluator/Provincial scoping preserved | ⚠️ **unverified** against data |
| Fiscal-year scoping unchanged | ✅ by inspection — same `utilities().getFiscalYear()` call |

## Unit Tests

17 SQL-shape tests, all passing, 100% line and function coverage of `coverStatus.ts`.

**Three of these tests failed on first run, and the implementation was not at fault.** My helper
sliced the statement at the first `where`/`order by`/`limit`, which are *inside the lateral
subquery*, so the assertions were inspecting the subquery instead of the outer query. The helpers now
slice after the lateral closes, and a comment records the trap. Worth noting because a less careful
version of those helpers would have passed vacuously and asserted nothing.

## Integration Tests

18 tests written, 0 executed. Two categories:

**Adapted (pre-existing).** The cover-status filter suite from intent 007 already asserted all four
filter values, latest-log-wins, no-cover, and region/province scope composition. Those assertions
were written against the JavaScript implementation, so **they are the membership-parity reference**.
Every one is byte-identical; only the result-reading changed, from a bare array to paging through the
envelope. A comment in the file states this so nobody later relaxes an assertion to make the new
query pass.

Paging through all pages, rather than requesting one large page, means the same file also exercises
page stability — a duplicated or skipped row breaks its existing `toHaveLength(4)` and set
assertions.

**Added (this bolt).** Six tests for cases the pre-pagination suite never needed, because a
JavaScript filter over an already-fetched array cannot fail the way a SQL predicate can:

- a cover with **zero logs** — yields `coverStatus: null` but must NOT be matched by `none`.
  This fixture is the only thing separating "no cover" from "cover with unresolved status"; without
  it, writing `none` as `latest.status IS NULL` passes every other test in the file
- that same cover excluded by every positive status filter
- two enrollments **sharing an `enrollDate`**, each appearing exactly once across all pages
- `meta.total` reflecting the filtered population, asserted to be strictly less than the unfiltered one
- one row per enrollment for a **multi-log cover** — proves the lateral's `LIMIT 1`
- a page beyond the end returning an empty page, not an error

## Security Tests

| Control | Result |
|---------|--------|
| Scope predicates sit in the same shared where clause as the filter | ✅ verified — count and page emit identical where clauses |
| `limit` ceiling rejects oversized requests before any query runs | ✅ inherited from bolt 025's schema, verified there |
| Role guards unchanged | ✅ by inspection — no guard line modified |
| Region/province scoping cannot be escaped via `page`/`limit` | ⚠️ **unverified** against data |

## Performance Tests

Not run. `EXPLAIN ANALYZE` on the lateral requires a database and is **outstanding**. ADR-0010
requires it before release, including whether an index on `cover_logs (cover_id, id DESC)` is needed.

Structural improvement confirmed by inspection: **three unbounded queries plus an in-memory filter
became two bounded queries.** No intermediate array of every enrollment, no Map of every cover.

## Coverage Report

| Module | Funcs | Lines |
|--------|-------|-------|
| `src/service/coverStatus.ts` | 100% | 100% |
| `src/service/enroll.ts` | 0% | 0% — exercised only by the skipped suite |
| Three enrollment route files | 0% | 0% — exercised only by the skipped suite |

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Test helpers sliced at the lateral subquery's clauses instead of the outer query's, so three assertions inspected the wrong SQL | Medium | ✅ Fixed — helpers rewritten, trap documented |
| `inArray` and `coverLogs` left as unused imports after deleting the helper; Biome flagged them but `--write` would not remove them | Low | ✅ Fixed manually |
| Membership parity for the five filter states is unverified | **High** | 🚫 **Open** — blocked on a database |
| `EXPLAIN ANALYZE` of the lateral not performed; index need unknown | Medium | 🚫 Open — blocked on a database |
| `enroll.integration.test.ts` still hard-fails with ECONNREFUSED rather than skipping cleanly | Low | 🚫 Open by decision — left consistent with the six other pre-existing integration files |

## Whole-suite state

`bun test`: **131 pass, 20 skip, 14 fail.**

All 14 failures are the seven pre-existing integration files × 2 hook failures each, every one an
ECONNREFUSED from the same unavailable database. None originate from this bolt. Typecheck holds at
the 18-error baseline with 0 errors in any file this bolt touched.

## Ready for Operations

- [ ] All acceptance criteria met — **no.** Story 005's membership-parity criteria are unverified
- [x] Code coverage > 80% — for `coverStatus.ts` only; not for the service or routes
- [ ] No critical/high severity issues open — **no.** Parity remains unverified
- [ ] Performance targets met — not measured
- [x] Security tests passing — for the controls testable without a database

**Cleared 2026-08-20.** Membership parity is proven and the index now exists on the database
(`idx_coverlogs_cover_id_id`, valid, in use). Re-measured: enrollment page 219.2 ms → 2.5 ms (87x),
count 185.9 ms → 2.4 ms (78x). **No blocker remains for this bolt.**
