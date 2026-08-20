---
unit: 001-list-pagination
bolt: 027-list-pagination
stage: model
status: complete
updated: 2026-08-20T02:43:08Z
---

# Static Model - Score Report Pagination + Page-Scoped Answer Hydration

## Bounded Context

Same context as bolts 025 and 026 — **Staff List Presentation** — extended to the Score Report read
path, the last and heaviest of the three families.

Everything the earlier bolts established is reused unchanged: Page Request, Page Window, Result
Count, Pagination Meta, Paginated Result, Total Order Key, Page Resolver, Page Assembler (bolt 025),
and the shared latest-log-wins lateral (bolt 026, ADR-0010).

This bolt introduces one structural difference that neither predecessor had, and it is the reason the
bolt needs its own model rather than being a third repetition.

**In bolts 025 and 026, one database row was one response item.** A factory row is a factory item;
an enrollment row is an enrollment item. Pagination was therefore a property of a single query.

**Here, one response item is computed from many rows.** A **Score Report** is not stored. It is
derived on demand from every **Answer** of a **Cover**, joined to its **Question** for category and
special-question metadata. One item on the page requires roughly forty rows to construct.

So this context must model a **two-phase read**:

```text
Phase 1 — SELECT the page of Covers      (pagination happens here)
Phase 2 — HYDRATE those Covers with Answers, and compute
```

The phase boundary is the whole point of the bolt. Today both phases operate on the entire scoped
population; the reason a nationwide request reads ~123,000 Answer rows to return twenty items is that
phase 2 is sized by phase 1's *unpaginated* output.

This context still owns no Score, Grade, or scoring rule. Those belong to the Assessment &
Evaluation context and pass through untouched.

## Domain Entities

No entities are owned. Four are referenced.

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| Cover (referenced) | `id` (identity, unique), `enrollId` | **The unit of pagination.** One Cover produces exactly one Score Report. `id` is unique and therefore available as a total-order key — unlike bolt 026, which had to construct one. |
| CoverLog (referenced) | `id`, `coverId`, `status` | Greatest `id` is current status. Identical rule to bolt 026, resolved by the identical shared lateral (ADR-0010). |
| Answer (referenced) | `coverId`, `selectedChoice` | The hydration input. Roughly forty per Cover. Contributes its live choice to the Score. **A Cover may have zero Answers** — see INV-14. |
| Question (referenced) | `category`, `special` | Supplies the category a Answer scores into, and the special-question flag the Grade rule consults. Joined during hydration, never paginated. |

### Cardinality, and why it matters here

```text
Cover ──1──► Score Report        one row in, one item out — safe to paginate
Cover ──0..*──► Answer           MANY rows per item — must NOT be paginated
Answer ──1──► Question           lookup, cannot multiply
```

Bolt 025's defect was a join that multiplied the paginated row. The risk here is the mirror image:
**paginating the wrong relation.** If `LIMIT` were applied to the Answer query rather than the Cover
query, a page would contain partial Score Reports — arithmetically valid, silently wrong.

## Value Objects

Bolt 025's six are reused. Three are added.

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **Scorable Cover** | A Cover whose current status is `in_review` or `finished` | The population being paginated. `in_progress` Covers are not scorable and are excluded — today in JavaScript, after fetching. This is the set `total` must count. |
| **Answer Set** | The Answers of one Cover, each carrying its Question's category and special flag | The hydration unit. Keyed by Cover id. **May be empty.** Its size is bounded by the Question catalogue, not by the data set. |
| **Score Report Total Order Key** | `covers.id`, or any ordering ending in a unique column | These queries currently have **no `ORDER BY` at all**, so their row order is whatever PostgreSQL returns. Offset pagination over that is not merely unstable — it is undefined. |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **Paginated Result\<ScoreReport\>** | Page Request, Result Count, Pagination Meta, item collection | Inherits INV-1..INV-5 unchanged from bolt 025. |
| **Score Report** | `factoryId`, `factoryNameTh`, `coverId`, `coverStatus`, `enrollId`, nullable `grade`, nested `scoring` | **INV-9**: the unit of pagination is the Cover. `total` counts Scorable Covers — never Answers, never Covers of any status. **INV-10**: hydration reads Answers only for the Cover ids on the requested page. **INV-11**: for a given Cover and unchanged data, Score, Category Scores, and Grade are byte-identical to the current implementation. **INV-12**: `grade` is non-null only when the Cover's current status is `finished` — inherited from intent `011-finished-cover-reward-guard` and binding here. **INV-13**: `items.length` equals the number of Covers on the page, never the number of Answers read. **INV-14**: a Scorable Cover with zero Answers still yields a Score Report, with an empty scoring breakdown. It must not disappear during hydration. |

### INV-14 is the one most likely to be violated

Hydration is a lookup, not a filter. If it were expressed as an inner join from Cover to Answer, a
Cover with no Answers would vanish between phase 1 and phase 2. The page would then contain fewer
items than `LIMIT`, `items.length` would disagree with the count that produced `total`, and the
caller would see a short page with no explanation.

The current implementation already handles this correctly — it groups Answers into a `Map` keyed by
Cover id and defaults a missing entry to an empty array. The rewrite must preserve that behaviour,
not rediscover it.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| *(none)* | — | — |

Unchanged across all three bolts. A pure read-side projection: no state change, no transaction, no
job. Recorded a third time so no later stage invents one.

## Domain Services

Bolt 025's Page Resolver, Page Assembler and Paginated Query are reused. Bolt 026's Cover Status
Resolver is reused **by import**, not reimplemented — ADR-0010 makes this a review gate.

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **Cover Status Resolver** | `currentStatus(cover)` | `src/service/coverStatus.ts` — **imported, never rewritten.** Reject at review if a second `coverLogs` ordering appears in the score service. |
| **Scorable Cover Predicate** | `isScorable(latest) -> predicate` | Selects `in_review` and `finished`. This bolt's own policy — the shared helper resolves status but deliberately does not filter. |
| **Score Report Page Reader** | `countScorable(scope)`; `fetchCoverPage(scope, Page Window)` | Phase 1. Paginated Query, Scorable Cover Predicate, Score Report Total Order Key |
| **Answer Set Hydrator** | `hydrate(coverIds) -> Map<coverId, Answer Set>` | Phase 2. **Input is the page's Cover ids only.** Must return an entry, or a safe default, for every requested id |
| **Score Report Builder** | `build(cover, Answer Set) -> Score Report` | Existing `calculateBreakdown` and `computeGrade`, unchanged. Applies INV-12. |

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **Scorable Cover Repository** | Cover (with joined factory and enrollment fields) | `countAll(filters)`; `findAll(filters, Page Window)`; `countByRegion(region)`; `findByRegion(region, Page Window)`; `countByProvince(provinceId)`; `findByProvince(provinceId, Page Window)` |
| **Answer Set Repository** | Answer joined to Question | `findByCoverIds(coverIds) -> rows` — **must accept an explicit id list and must never be called with the unpaginated population** |

**Contract obligations:**

1. **Paired predicate** — count and page built from one shared expression. Carried from bolts 025/026.
2. **Status resolved by the shared lateral** — imported from `coverStatus.ts`. No second implementation.
3. **Scorable filter in SQL** — `in_review` and `finished` selected by the predicate, not in JavaScript.
4. **Total order** — must be added; these queries have none today.
5. **Hydration is page-scoped** — the Answer query receives at most `limit` Cover ids.
6. **Hydration never filters** — a Cover with no Answers survives with an empty Answer Set.
7. **Empty page issues no Answer query** — guard the empty id list.
8. **Scoring untouched** — `calculateBreakdown`, `computeGrade`, the choice-to-points map, and the
   special-question Grade gate are not modified.
9. **Projection fidelity** — the Score Report item shape is unchanged, `grade` nullable as today.

## Ubiquitous Language

Terms from bolts 025 and 026 carry over. Five are added.

| Term | Definition |
|------|------------|
| **Scorable Cover** | A Cover whose current status is `in_review` or `finished`. The population the Score Report lists paginate. An `in_progress` Cover is not scorable and never appears. |
| **Two-phase read** | Selecting the page of Covers first, then hydrating only those Covers with their Answers. The shape that makes Answer volume a function of page size instead of data-set size. |
| **Hydration** | Loading the Answers needed to compute the Score Reports on a page. A lookup, never a filter — it cannot add or remove an item. |
| **Answer Set** | The Answers of one Cover, with their Questions' category and special flag. Bounded by the Question catalogue. May be empty. |
| **Fan-out** | The number of Answer rows read to serve one request. Today it is a function of the whole scoped population; after this bolt it is a function of `limit`. |

### Terms deliberately excluded

| Term | Why excluded |
|------|--------------|
| **Paginated answers** | Answers are never paginated. Naming the idea invites applying `LIMIT` to the wrong relation, which produces partial Score Reports that look arithmetically valid. |
| **Cached score** | Score is derived on demand (ADR-0001). This bolt changes when Answers are read, never whether Scores are stored. |

## Story Coverage

| Story | Covered by |
|-------|-----------|
| 007-score-status-sql-pushdown | Scorable Cover, Scorable Cover Predicate, Cover Status Resolver (imported), obligations 2–4 |
| 008-page-scoped-answer-fanout | Answer Set, Answer Set Hydrator, Fan-out, INV-10/13/14, obligations 5–7 |
| 009-score-list-pagination | Score Report Page Reader, Scorable Cover Repository, INV-9/11/12, obligations 1, 8, 9 |

## Modelling Findings

Four findings for the technical design.

1. **The unit of pagination is the Cover, not the Answer.** Stated explicitly because the mirror of
   bolt 025's defect lives here: applying `LIMIT` to the hydration query would return partial Score
   Reports — each one arithmetically well-formed, and all of them wrong. No error would surface.

2. **INV-14 — hydration must not filter.** A Scorable Cover with zero Answers must still produce a
   report. Expressing hydration as an inner join would silently drop it, making `items.length`
   disagree with the `total` that was counted a moment earlier. The current code gets this right via
   a `Map` with an empty-array default; the rewrite must preserve it deliberately.

3. **This family gets its total order free, but currently has none.** `covers.id` is unique, so unlike
   bolt 026 no tiebreaker must be constructed. But the three existing queries have **no `ORDER BY`
   whatsoever**, so today's row order is undefined — offset pagination over it would be meaningless
   rather than merely unstable.

4. **The Grade rule is a hard inherited constraint, not incidental behaviour.** Intent
   `011-finished-cover-reward-guard` established that `grade` is non-null only for `finished` Covers.
   This bolt changes which Covers are selected and when Answers are read, both upstream of Grade
   computation. Regression here would silently expose a reward for an `in_review` Cover — the exact
   defect intent 011 exists to prevent.
