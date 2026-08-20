# ADR 0011: Paginate the aggregate root, then hydrate the page

**Status:** Accepted (2026-08-20)

**Applies to:** any paginated list whose items are *computed* from child rows rather than projected from one row. Introduced for Score Reports; stated generally because the next such list will face the same choice.

## Context

Intent `012-list-pagination` paginates three list families. Two of them are structurally simple: one database row is one response item. A factory row is a factory item; an enrollment row is an enrollment item. Pagination is a property of a single query, and `LIMIT` goes in the obvious place.

Score Reports are not like that. A Score Report is **not stored** — ADR-0001 established that a Score is derived on demand and never persisted. Each report is computed from every `Answer` of a `Cover`, joined to its `Question` for category and special-question metadata. One report requires roughly forty rows to construct.

The existing implementation therefore does two things at once, and sizes both by the entire scoped population:

1. select every Cover in scope, resolve each one's status, and discard the `in_progress` ones in JavaScript;
2. select every `Answer` of every survivor, group them, and compute a report for each.

For a nationwide admin request against ~3,000 scorable Covers this reads roughly **123,000 answer rows**, builds 3,000 reports, returns twenty, and discards 2,980. Adding `LIMIT` to the response array at the end changes nothing: the cost has already been paid.

The question this ADR answers is *where* pagination belongs when an item is an aggregate rather than a row.

## Decision

Split the read into two phases with an explicit boundary, and paginate the first.

```text
Phase 1 — SELECT the page of aggregate roots   ← pagination happens HERE
Phase 2 — HYDRATE those roots with their children, then compute
```

Concretely, for Score Reports:

- **Phase 1 paginates Covers.** The scorable filter (`in_review` or `finished`) is a SQL predicate, a total order is imposed, and `LIMIT`/`OFFSET` select at most `limit` Covers. A count query built from the same predicate supplies `total`.
- **Phase 2 hydrates only those Covers.** The answer query receives the page's Cover ids and nothing else. Fan-out becomes `limit × questions-per-cover` — bounded by page size, independent of the data set.
- **The computation is untouched.** `calculateBreakdown`, `computeGrade`, the choice-to-points map and the special-question Grade gate are unchanged. Only the size of their input changes.

Two rules govern the boundary, and both exist because breaking them fails silently:

- **The unit of pagination is the aggregate root, never the child.** `LIMIT` belongs on the Cover query. Applying it to the answer query would return partial Score Reports.
- **Hydration is a lookup, never a filter.** It may not add or remove an item chosen by phase 1. A root with zero children must survive with an empty child set.

## Considered options

- **Paginate the computed array in application code (status quo, rejected).** Compute every report, then slice. Trivial to write and impossible to get wrong. Rejected because it eliminates none of the cost: the 123,000-row read has already happened by the time the slice occurs. This is the current behaviour and the defect the intent exists to remove.
- **Apply `LIMIT` to the answer query (rejected — and dangerous).** Superficially it bounds the read. In fact it returns some arbitrary N answers, which belong to a handful of Covers, producing reports built from a *fraction* of their answers. Each result carries a well-formed percentage and possibly a Grade. Nothing errors. Rejected as the most dangerous option available, and named here explicitly so it is never reached for.
- **Denormalise a computed score column, maintained on write (rejected).** Makes the list a plain single-row projection and pagination trivial. Rejected because it contradicts ADR-0001's on-demand derivation, requires a schema change the intent forbids, and creates a staleness class of bug — a stored score disagreeing with its answers — that cannot exist today.
- **One query with a window function over answers (rejected).** Technically possible. Rejected because the scoring rules — n/a exclusion from both numerator and denominator, per-category breakdown, the special-question Grade gate — are already implemented, tested, and understood in TypeScript. Reimplementing them in SQL would duplicate domain logic into a second language for a bounded gain, and the parity risk would exceed the benefit.
- **Two-phase read (chosen).** Bounds the expensive phase without moving any domain logic.

## Reasons

- **It bounds the dominant cost without touching the scoring rules.** The riskiest code in the path — the formulas — is not modified at all.
- **The bound is structural, not incidental.** Fan-out is a function of `limit`, which is itself capped. It cannot regress as data grows.
- **The phase boundary is a reviewable place.** "Does `LIMIT` sit on the root query?" and "is hydration a lookup?" are two questions a reviewer can answer by reading, without running anything.
- **It generalises.** Any future computed list — a dashboard, a summary, an export — faces the identical choice, and now has a recorded answer.

## Consequences

- **Three queries per list request** instead of two: count, page, hydrate. Accepted; all three are bounded, whereas the previous two were not.
- **A root with no children needs deliberate handling.** A scorable Cover with zero answers must still yield a report with an empty breakdown. The existing implementation achieves this with a `Map` and an empty-array default; that must be preserved consciously, because expressing hydration as an inner join would silently drop the item and make `items.length` disagree with `total`.
- **An empty page must issue no hydration query at all.** An unguarded empty id list is both wasteful and, in some drivers, a syntax error.
- **Testing must include a childless root.** Without that fixture an accidental inner join passes every other assertion in the suite. This is the single most important test case for any list built this way.
- **The pattern is now expected.** A future computed list that loads all children and slices afterwards should be rejected at review with a reference to this ADR.
