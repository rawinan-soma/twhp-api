---
unit: 001-list-pagination
bolt: 026-list-pagination
stage: model
status: complete
updated: 2026-08-19T14:18:17Z
---

# Static Model - Enrollment List Pagination + Cover-Status Pushdown

## Bounded Context

Same context as bolt 025 — **Staff List Presentation** — extended to the Enrollment read path.

Bolt 025 established that this context owns no entities, only value objects and pure services, and
that its whole job is selecting, counting, ordering, and describing a slice of an already-scoped
result set. Everything it established is reused here unchanged: Page Request, Page Window, Result
Count, Pagination Meta, Paginated Result, Total Order Key, Page Resolver, Page Assembler.

What bolt 026 adds is one genuinely new modelling problem that bolt 025 did not have.

**Bolt 025's filters were already predicates.** `validated` and `enrolled` were expressible in SQL,
so applying `LIMIT` was mechanical once row multiplication was removed.

**Bolt 026's filter is not a predicate today — it is a post-query projection.** Cover status is not
a column. It is *derived* by walking each Enrollment to its Cover, then that Cover to its
latest-by-id CoverLog. Today that derivation happens in JavaScript, after every matching Enrollment
row has already been fetched, and the filter is applied to the resulting array.

That is why this bolt is modelled at all rather than treated as more of the same. The domain
question is: **what exactly is Cover Status, such that it can live inside a `WHERE` clause without
changing which Enrollments are selected?**

This context does not own Cover, CoverLog, or Enrollment. It borrows one derived attribute from the
Assessment & Evaluation context and must reproduce that context's derivation rule exactly.

## Domain Entities

As in bolt 025, this context owns no entities. Three are referenced, and for this bolt the
*relationships between them* are what matter rather than their attributes.

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| Enrollment (referenced) | `id` (identity, unique), `enrollDate`, factory and province joins, eleven standard-certificate URL columns | Owned by the Enrollment context. **`enrollDate` is not unique**, so it cannot alone provide a total order — unlike bolt 025's `accountId`. Scoped to the current fiscal year by every caller. |
| Cover (referenced) | `id`, `enrollId` | Owned by Assessment & Evaluation. **At most one Cover per Enrollment.** This cardinality is what makes the join safe: unlike bolt 025's `enrolls` join, joining Cover cannot multiply Enrollment rows. An Enrollment may have zero Covers. |
| CoverLog (referenced) | `id` (serial), `coverId`, `status` ∈ {`in_progress`, `in_review`, `finished`} | Append-only. **The row with the greatest `id` is the Cover's current status — never the greatest timestamp.** This is the latest-log-wins rule from intents 007 and 011 and it is binding here. A Cover may have zero CoverLogs. |

### The relationship chain, and where it can be empty

```text
Enrollment ──0..1──► Cover ──0..*──► CoverLog
     │                 │                 │
     │                 │                 └─ zero logs  → status is null
     │                 └─ zero covers     → coverId is null, status is null
     └─ always exactly one row per Enrollment in the result
```

Both breaks in the chain are real and produce distinct outcomes. A model that collapses them is
wrong: "Enrollment has no Cover" and "Cover has no status yet" are different states, and only the
first is matched by the `none` filter.

## Value Objects

Bolt 025's six value objects are reused verbatim. Three are added.

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **Cover Status** | one of `finished`, `in_progress`, `in_review`, or **null** | Derived, never stored on the Enrollment. Null has two distinct causes — no Cover, or a Cover with no CoverLog — and the value object cannot distinguish them. That is why the filter below is not simply an equality test on this value. |
| **Cover Status Filter** | `finished` \| `in_progress` \| `in_review` \| `none` \| absent | **`none` is not a member of Cover Status.** Three values test the derived status; `none` tests the *absence of a Cover*; absent applies no test at all. Modelling `none` as a fourth status value is the single most likely implementation error in this bolt. |
| **Enrollment Total Order Key** | `enrollDate` descending, then a unique tiebreaker | `enrollDate` alone is not a total order. Bolt 025 got its total order free from `accountId`; this family must construct one. The primary direction stays newest-first so the visible list order does not change for staff. |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **Paginated Result\<EnrollmentListItem\>** | Page Request, Result Count, Pagination Meta, item collection | Inherits INV-1..INV-5 from bolt 025 unchanged. |
| **Enrollment List Item** | Enrollment columns, joined factory/province fields, derived `coverId`, derived `coverStatus` | **INV-6**: exactly one item per Enrollment — the Cover join must never multiply. **INV-7**: `coverId` null ⟹ `coverStatus` null. The converse does not hold: a Cover with no CoverLog yields a non-null `coverId` with a null `coverStatus`. **INV-8**: `coverStatus` is derived from the greatest-`id` CoverLog of that Cover, never from a timestamp and never from any other row. |

### The invariant this bolt exists to restore

**INV-3** (from bolt 025: *count and page share one predicate*) is currently **violated** on this
read path — not by a bug in the count, but because there is no count at all and the filter runs
outside SQL entirely. Restoring INV-3 here is the whole point of story 005:

> A filter that runs after the query cannot participate in the predicate that the count and the page
> window are computed from. `LIMIT` applied before it slices the *unfiltered* set, and any count
> taken alongside describes a different population than the items returned.

This is a correctness statement, not a performance one.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| *(none)* | — | — |

Unchanged from bolt 025. Still a pure read-side projection: no state change, no transaction, no job.
Recorded again so a later stage does not invent one.

## Domain Services

Bolt 025's Page Resolver, Page Assembler, and Paginated Query are reused unchanged.

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **Cover Status Resolver** | `currentStatus(cover) -> Cover Status` — selects the greatest-`id` CoverLog | Must be expressible **as a SQL predicate**, not only as a function over fetched rows. This is the defining requirement of the bolt: the same rule, relocated from application memory into the query. |
| **Cover Status Predicate Builder** | `toPredicate(Cover Status Filter) -> predicate` | Translates the four filter values into SQL. Three become tests on the resolved status; `none` becomes an absence test on the Cover join. Absent yields no predicate. |
| **Enrollment List Reader** | `listAll(scope, coverStatusFilter, Page Request)`; `listByProvince(...)` | Paginated Query, Cover Status Resolver, Cover Status Predicate Builder, Page Resolver, Page Assembler |

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **Enrollment List Repository** | Enrollment (read model with derived Cover projection) | `countAll(scope, coverStatusFilter) -> Result Count`; `findAll(scope, coverStatusFilter, Page Window) -> EnrollmentListItem[]`; `countByProvince(provinceId, coverStatusFilter)`; `findByProvince(provinceId, coverStatusFilter, Page Window)` |

**Contract obligations on every implementation:**

1. **Paired predicate** — each `count*` and its matching `find*` build their predicate from one
   shared expression. Carried forward from bolt 025; it is the obligation this bolt restores.
2. **Latest-log-wins in SQL** — Cover status resolved by greatest `CoverLogs.id`. Never by
   timestamp. Never in application code.
3. **`none` is an absence test** — expressed as an outer join with a null check on the Cover, not as
   a comparison against a status value.
4. **No multiplication** — at most one Cover per Enrollment and one resolved status per Cover, so
   the result must be exactly one row per Enrollment. Where the CoverLog relation is one-to-many, the
   resolution must collapse it to a single row before it can widen the result.
5. **Total order** — `enrollDate` descending plus a unique tiebreaker.
6. **Projection fidelity** — the item shape, including nullable `coverId` and `coverStatus`, is
   unchanged from today, field for field.
7. **Scope is upstream** — fiscal-year, region, and province predicates are unchanged and applied in
   the same `WHERE` clause.

## Ubiquitous Language

Bolt 025's twelve terms carry over. Six are added or sharpened.

| Term | Definition |
|------|------------|
| **Cover Status** | An Enrollment's current assessment state, derived from the greatest-`id` CoverLog of its Cover. Null when there is no Cover, or a Cover with no log. Never stored on the Enrollment. |
| **Latest-log-wins** | The rule that a Cover's current status is the CoverLog row with the greatest serial `id`. Established by intents 007 and 011 and binding on this bolt. An older log with a newer timestamp does not win. |
| **Cover Status Filter** | The `?coverStatus=` query value. Four possible values, of which only three are Cover Statuses. |
| **`none`** | The filter value matching Enrollments that have **no Cover at all**. Not a status. Not the same as a Cover whose status is unresolved. |
| **Filter pushdown** | Relocating a filter from application code into the SQL predicate, so that counting and page slicing operate on the same population the caller asked for. |
| **Membership** | The *set* of Enrollments a filter selects, independent of order or row count. The property that the SQL rewrite must preserve exactly, and the thing a parity test asserts. |

### Terms deliberately excluded

| Term | Why excluded |
|------|--------------|
| **Cover status column** | There is no such column. Naming it would invite a denormalisation this intent does not sanction. |
| **Latest timestamp** | Actively wrong. The rule is greatest `id`. Excluded so it is never written by accident. |

## Story Coverage

| Story | Covered by |
|-------|-----------|
| 005-cover-status-sql-pushdown | Cover Status, Cover Status Filter, Cover Status Resolver, Cover Status Predicate Builder, INV-6/7/8, obligations 2–4 |
| 006-enrollment-list-pagination | Enrollment List Reader, Enrollment List Repository, Enrollment Total Order Key, obligations 1, 5–7 |

## Modelling Findings

Four findings the technical design must carry forward.

1. **`none` is the highest-risk value in this bolt.** It is the only filter value that is not a
   status, and the only one whose SQL form is an absence test rather than a comparison. An
   implementation that treats it as a fourth status silently returns an empty list — a plausible,
   quiet, wrong answer.

2. **Two distinct sources of null must not be conflated.** "No Cover" and "Cover with no CoverLog"
   both produce `coverStatus: null` in the projection, but only the first is matched by `none`. The
   projection cannot distinguish them and does not need to; the *predicate* must.

3. **The Cover join is safe; the CoverLog relation is not.** At most one Cover per Enrollment, so
   joining Cover cannot multiply rows — unlike bolt 025's `enrolls` join. But CoverLog is
   one-to-many, so the status resolution must collapse to a single row per Cover *before* it can
   participate in the result, or INV-6 breaks and bolt 025's row-multiplication problem reappears in
   a new place.

4. **This family must construct its total order rather than inherit one.** Bolt 025 got `accountId`
   free. `enrollDate` is not unique, so without a tiebreaker two Enrollments sharing a date have
   undefined relative order and can repeat or vanish across a page boundary. The Enrollment `id` is
   the obvious candidate; the design stage must confirm it and state the direction.
