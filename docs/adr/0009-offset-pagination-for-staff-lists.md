# ADR 0009: Offset pagination, not cursor pagination, for staff list endpoints

**Status:** Accepted (2026-08-19)

**Confirms:** the pagination strategy already stated in `memory-bank/standards/api-conventions.md`. This ADR deviates from no standard; it records the reasoning so the choice is not silently revisited.

## Context

Intent `012-list-pagination` bounds nine staff list endpoints that currently return every matching row. Two pagination strategies were available.

**Offset pagination** addresses a page by ordinal position: `?page=3&limit=20` skips sixty rows. It can report a total count and can jump directly to any page.

**Cursor (keyset) pagination** addresses a page by a stable key from the previous page: "give me twenty rows after `accountId = 4211`". It cannot cheaply report a total or jump to an arbitrary page, but it is immune to drift and its cost does not grow with page depth.

Cursor pagination is the stronger default for large public APIs and infinite-scroll clients, so choosing offset needs a recorded reason rather than an assumption.

The consumers here are internal staff list views for DOED Admins, Evaluators, and Provincial Officers. The largest result set is the nationwide factory registry. Growth is bounded by the number of registered factories in Thailand and by one enrollment cycle per fiscal year.

## Decision

Use offset pagination for all nine staff list endpoints.

- **Query parameters**: `page` (1-indexed, default 1, minimum 1) and `limit` (default 20, minimum 1, maximum 100).
- **Response**: `{ items, meta: { page, limit, total, totalPages } }` — see ADR 0007.
- **Every paginated query must impose a total order**, meaning an ordering whose final sort column is unique per row. Offset pagination over a non-total order is incorrect, not merely untidy: `OFFSET` has no defined meaning without a deterministic sequence. The score report queries currently have no `ORDER BY` at all and must gain one.
- **Drift is accepted and documented.** A row inserted between two page requests can shift a later row across a page boundary, so a client paging through a changing data set may miss or repeat a row. This is inherent to offset pagination.
- **The word "cursor" is excluded from this context's vocabulary**, so the two strategies are never partially mixed.

## Considered options

- **Cursor/keyset pagination (rejected).** Immune to drift; constant cost at any depth. Rejected because staff list views need a total count and jump-to-page, and cursors provide neither cheaply. A staff user filtering the national registry expects to see "137 results" and to jump to the last page.
- **Offset pagination (chosen).** Supplies `total` and arbitrary page access directly, at the cost of drift and of deep-offset scan cost.
- **Offset now, cursor later behind the same envelope (considered, not adopted).** The envelope could carry a cursor field later without a further breaking change. Recorded as a viable migration path, not as a commitment.

## Reasons

- **`total` and `totalPages` are product requirements, not conveniences.** Staff list views display a result count and a page selector. Cursors cannot supply either without a separate count query, which forfeits the main advantage of cursors.
- **The data sets are small and the page depth is shallow.** Deep-offset scan cost is the standard argument against offset pagination; it does not bite at this scale, where the maximum `limit` is 100 and result sets are bounded by a national registry.
- **Drift is tolerable for this data.** Factory registrations and enrollments change on a human timescale, not continuously. A staff user paging through a list is unlikely to encounter a concurrent insert, and the consequence if they do is one row seen twice.
- **It matches the existing written standard**, so no client or contributor is surprised.

## Consequences

- **Page drift is a known, accepted defect.** It must be documented in `docs/api-conventions.md` rather than treated as a bug when reported.
- **Every paginated query carries a total-order obligation.** This is a permanent constraint on all nine endpoints and on any endpoint that joins this set later. A new list query without a unique final sort column is incorrect, and review must treat it as such.
- **Deep pages get slower as data grows.** `OFFSET 10000` scans and discards ten thousand rows. Acceptable at current scale; revisit if any result set reaches the tens of thousands.
- **`total` costs a second query per request.** Two queries per list request instead of one. Accepted as the price of the count.
- **Migration to cursors remains open.** The envelope can carry a cursor field additively. This ADR would then be superseded rather than contradicted.
