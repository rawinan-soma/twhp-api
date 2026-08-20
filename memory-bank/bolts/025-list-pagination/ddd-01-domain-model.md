---
unit: 001-list-pagination
bolt: 025-list-pagination
stage: model
status: complete
updated: 2026-08-19T02:34:53Z
---

# Static Model - List Pagination (Foundation + Factory Lists)

## Bounded Context

**Context name**: Staff List Presentation.

This bolt models a *read-side presentation concern*, not a new business domain. It sits at the
boundary between the existing Assessment & Evaluation context (which owns Cover, Answer, Grade) and
the HTTP consumers of that context.

The context boundary matters because it explains what this model deliberately does **not** own:

- It does not own Factory, Enrollment, Cover, Answer, Score, or Grade. Those belong to the existing
  Assessment & Evaluation and Registry contexts and pass through this context untouched.
- It does not interpret item content. A page of Factories and a page of Score Reports are handled
  identically; only the item schema differs.
- It does not decide *what* a Staff Account may see. Region and province scoping remain owned by the
  existing authorization context and are applied upstream of pagination.

What this context owns is narrow and complete: **how a bounded slice of an already-scoped,
already-filtered result set is selected, counted, ordered, and described to the caller.**

Scope of this bolt within that context: the shared contract itself plus its first application, the
three Factory registry lists. Enrollment and Score Report applications are bolts 026 and 027.

## Domain Entities

This context has no entities of its own. It has no identity-bearing, mutable, persisted concepts —
by design. Everything it introduces is a value object or a service.

The entities below are **referenced, not owned**. They are listed to make the pass-through
relationship explicit and to state the one property this context depends on for each.

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| Factory (referenced) | `accountId` (identity), plus the existing registry projection: `name_th`, `name_en`, `tsic_code`, address fields, `is_validate`, joined province/district/subdistrict names | Owned by the Registry context. This bolt reads it and must not alter its projection or its snake_case field naming. `accountId` is unique and therefore usable as a total-order key. |
| Staff Account (referenced) | `accountId`, `role` (`DOED`, `Evaluator`, `Provincial`), `region` or `provinceId` | Owned by the authorization context. Determines the scope predicate applied *before* pagination. Pagination never widens or narrows what a role may see. |
| Enrollment (referenced, later bolts) | Enrollment columns, `enrollDate` | `enrollDate` is not unique, so it cannot alone provide a total order. Recorded here because story 003 must supply the tiebreaker for all three families. |
| Cover (referenced, later bolts) | `id`, `enrollId` | Not read by this bolt. Listed because the Score Report queries in scope of story 003 select Covers and currently impose no order. |

## Value Objects

The whole model is value objects. Each is immutable, compared by value, and has no lifecycle.

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **Page Request** | `page: integer`, `limit: integer` | `page >= 1` (1-indexed, never 0-indexed). `1 <= limit <= 100`. Both are optional at the boundary and resolve to defaults: `page = 1`, `limit = 20`. Equality by both values. A Page Request is always *valid* once constructed — invalid input is rejected at the boundary and never becomes a Page Request. |
| **Page Window** | `offset: integer`, `limit: integer` | Derived, never supplied by a caller. `offset = (page - 1) * limit`. This is the only place the 1-indexed public contract translates to the 0-indexed database concept, which is why it exists as a distinct value rather than as inline arithmetic. |
| **Result Count** | `total: integer` | `total >= 0`. Defined as the number of rows matching the *complete* predicate for the request — scope filter plus every domain filter. Explicitly not the number of items returned. |
| **Pagination Meta** | `page`, `limit`, `total`, `totalPages` | `totalPages = ceil(total / limit)`, and `totalPages = 0` when `total = 0`. `page` and `limit` report the *effective* values used, including applied defaults, never the raw query string. Field names are camelCase regardless of the casing of the items it accompanies. |
| **Paginated Result\<T\>** | `items: T[]`, `meta: Pagination Meta` | `items.length <= meta.limit`. Generic over the item type; the context assigns no meaning to `T`. This is the sole public shape of a paginated list response. |
| **Total Order Key** | The ordered list of sort columns, whose final column is unique | An ordering is a valid Total Order Key only if its last column is unique per row. This is the invariant that makes offset pagination sound; an ordering without it is not merely untidy but incorrect. |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **Paginated Result\<T\>** | Page Request (effective), Result Count, Pagination Meta, the item collection | **INV-1**: `items.length <= limit`. **INV-2**: `totalPages = ceil(total / limit)`, or `0` when `total = 0`. **INV-3**: `total` is derived from the same predicate as `items`; a count and a page that disagree is a broken aggregate. **INV-4**: A Page Request whose window lies beyond `total` yields `items = []` with `meta` still fully accurate — an empty page is a valid aggregate, never an error. **INV-5**: Item content is opaque; the aggregate never inspects, reorders, or reshapes an item. |

There is exactly one aggregate. Its boundary is a single response to a single request. It has no
persistence, no identity, and no lifetime beyond the request. Nothing outside the aggregate may
construct a Pagination Meta independently — that is what guarantees INV-2 and INV-3 hold everywhere.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| *(none)* | — | — |

This context emits no domain events, and this is a deliberate finding rather than an omission.
Pagination is a pure read-side projection: it changes no state, commits no transaction, and enqueues
no job. Introducing an event here would imply a state change that does not exist.

Recorded so that later stages do not invent one.

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **Page Resolver** | `resolve(rawPage?, rawLimit?) -> Page Request`; `toWindow(Page Request) -> Page Window` | None. Pure function over primitives. Applies defaults and asserts bounds. |
| **Page Assembler** | `assemble(items, total, Page Request) -> Paginated Result<T>` | None. Pure function. Sole owner of the `totalPages` calculation, which enforces INV-2 in exactly one place. |
| **Paginated Query** | `count(predicate) -> Result Count`; `fetch(predicate, Total Order Key, Page Window) -> items` | The persistence boundary. The two operations **must** share one predicate; separate predicates violate INV-3. |
| **Factory List Reader** (this bolt's application) | `listAll(scope, filters, Page Request)`; `listByRegion(...)`; `listByProvince(...)` | Paginated Query, Page Resolver, Page Assembler, and the existing Registry read model. Applies the existing `validated` / `enrolled` filters and the existing role scope, then delegates paging. |

The first three services are generic and reusable by bolts 026 and 027. Only the fourth is specific
to this bolt. That split is the point of doing Factory lists first.

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **Factory Registry Repository** | Factory (read model) | `countAll(filters) -> Result Count`; `findAll(filters, Page Window) -> Factory[]`; `countByRegion(region, filters)`; `findByRegion(region, filters, Page Window)`; `countByProvince(provinceId, filters)`; `findByProvince(provinceId, filters, Page Window)` |

**Contract obligations on every implementation:**

1. **Paired predicate** — each `count*` and its matching `find*` must build their predicate from one
   shared expression. They may not be written as two independently maintained WHERE clauses.
2. **Total order** — every `find*` orders by a Total Order Key. For this repository that is
   `accountId` ascending, which is already unique.
3. **Filter fidelity** — `validated` and `enrolled` retain their current meaning exactly, including
   the existing behavior where `enrolled = false` disables the fiscal-year Enrollment-date filter
   rather than selecting unenrolled Factories. This bolt preserves that semantic; it does not repair
   it.
4. **Projection fidelity** — the returned projection is byte-identical to today's, snake_case field
   names included.
5. **Scope is upstream** — region and province scoping is a repository-level predicate, never a
   pagination concern.

Repository interfaces for Enrollment and Score Report are deliberately absent; they belong to bolts
026 and 027.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Page** | A bounded, contiguous slice of a result set, addressed by a 1-indexed number. The first page is page 1, never page 0. |
| **Limit** | The maximum number of items one Page may contain. Defaults to 20; may never exceed 100. |
| **Offset** | The count of rows skipped before the Page begins. An internal, 0-indexed translation of Page; never exposed to a caller. |
| **Total** | The number of rows matching the complete request predicate. Not the number of items on the Page. |
| **Total Pages** | `ceil(total / limit)`; zero when `total` is zero. |
| **Envelope** | The `{ items, meta }` response object. Applies to the nine staff list endpoints only; it is not a global response wrapper for this API. |
| **Meta** | The pagination descriptor inside the Envelope. Always camelCase, even when its items are snake_case. |
| **Total Order** | An ordering whose final sort column is unique per row. The precondition that makes offset pagination correct. |
| **Page Stability** | The property that iterating every Page over an unchanged data set yields each row exactly once, with no duplicate and no omission. Guaranteed by Total Order. |
| **Empty Page** | A Page whose window lies beyond Total. A valid, successful result with `items: []` — never a 404. |
| **Effective Page Request** | The `page` and `limit` actually applied after defaults are resolved. This is what Meta reports back, not the raw query values. |
| **Scope** | The role-derived predicate (nationwide, one health region, or one province) applied before pagination. Owned by the authorization context, not by this one. |

### Terms deliberately excluded

| Term | Why excluded |
|------|--------------|
| **Cursor** | Cursor pagination was rejected during Inception. The word must not appear in this context's vocabulary, so that it is never partially introduced. |
| **hasNext / hasPrev** | Derivable from `page` and `totalPages`. Excluded to keep one source of truth in Meta. |
| **Export** | The full-data need is served by a separate export API path in its own intent. It is not a pagination concept. |

## Story Coverage

| Story | Covered by |
|-------|-----------|
| 001-pagination-query-contract | Page Request, Page Window, Page Resolver |
| 002-pagination-response-envelope | Pagination Meta, Paginated Result, Page Assembler, INV-1 to INV-5 |
| 003-deterministic-list-ordering | Total Order Key value object; repository contract obligation 2; Page Stability |
| 004-factory-list-pagination | Factory List Reader, Factory Registry Repository, contract obligations 1 to 5 |

## Modeling Findings

Three findings from this stage that the technical design must carry forward:

1. **This context has no entities and no events.** It is entirely value objects and pure services.
   That is the correct shape for a read-side concern, and it means the implementation should be a
   small shared module plus repository changes — not a new layer.

2. **`Total Order Key` is a domain invariant, not a style preference.** Offset pagination over a
   non-total order is incorrect, not untidy. The Score Report queries currently have no ordering at
   all, so story 003 is a correctness prerequisite for bolt 027, not a tidy-up.

3. **INV-3 (count and page share one predicate) is the invariant most likely to be violated in
   implementation**, because it is the only one that spans two separate database queries. The
   repository contract makes it an explicit obligation for that reason. It is also the invariant that
   the two SQL rewrites in bolts 026 and 027 put under the most pressure.
