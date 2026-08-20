# ADR 0008: Replace the `enrolls` join with an `EXISTS` subquery in the factory list filter

**Status:** Accepted (2026-08-19)

**Amends:** FR-6 of intent `012-list-pagination` — *"Existing filters, authorization, and scoping unchanged"* — for one observable behaviour: duplicate factory rows produced by the `enrolls` join are removed. Every filter's selection semantics are otherwise preserved, including the `enrolled=false` oddity described below.

## Context

All three factory list queries join `enrolls` so that the `enrolled` filter can restrict results to factories enrolled in the current fiscal year:

- `getAllFactories` (Admin) uses a **left** join.
- `getAllFactoriesByRegion` and `getAllFactoriesByProvinceId` use **inner** joins.

The fiscal-year date predicate — `enrollDate >= fiscalYearStart AND enrollDate < fiscalYearEnd` — is pushed into the `WHERE` clause **only when `enrolled` is true**. When `enrolled` is false or omitted, nothing constrains the join to a single `enrolls` row.

A factory that has enrolled in three fiscal years therefore produces **three identical result rows**. On the Admin endpoint, where the join is a left join and the date filter is absent, this is unconditional.

Today this is a latent cosmetic defect: a duplicated entry inside a long, unpaginated list that nobody counts. Under pagination it stops being cosmetic and becomes three correctness failures:

1. `count(*)` counts join rows, not factories, so `meta.total` overstates the result set. A caller computing `totalPages` from it pages into emptiness.
2. `items.length` counts join rows, so a page requested with `limit=20` can contain materially fewer than twenty distinct factories.
3. A factory's duplicate rows can straddle a page boundary, so the same factory appears on two consecutive pages. This violates Page Stability even though `accountId` is unique — the ordering is a total order over *join rows*, which is not the entity the caller is paging through.

Failure 1 is the decisive one. `meta.total` is a new public contract term introduced by this intent, and shipping it knowingly wrong is not defensible.

## Decision

Express the `enrolled` filter as a correlated `EXISTS` subquery instead of a join, in all three factory list queries.

- **The `enrolls` join is removed** from the factory list read path. `enrolls` is referenced only inside the `EXISTS` predicate.
- **A factory row is never multiplied.** The subquery is a boolean test, so cardinality is one row per factory regardless of how many enrollments exist.
- **`count` becomes exact.** `count()` over the same predicate counts factories, satisfying invariant INV-3 (count and page share one predicate) without a `DISTINCT`.
- **`accountId` ascending becomes a genuine total order** over the entity being paged, restoring Page Stability.
- **Filter selection semantics are preserved.** Every factory selected before is selected now; only duplicate rows disappear.
- **The `enrolled=false` oddity is preserved verbatim.** `enrolled=false` continues to mean "do not apply the fiscal-year enrollment-date filter" rather than "select factories with no enrollment". That semantic is confusing and is documented as such in `docs/api-conventions.md`, but repairing it is explicitly out of scope for intent `012`. This ADR must not be read as having fixed it.
- **The left/inner distinction disappears with the join.** For the region and province variants the inner join previously excluded factories with no `enrolls` row at all when `enrolled` was false. Construction must confirm with a parity test whether that exclusion is load-bearing; if it is, the `EXISTS` predicate must reproduce it explicitly rather than by accident of join type.

## Considered options

- **Change nothing and accept duplicates (rejected).** Strictly honours FR-6's wording. Rejected because it ships `meta.total` knowingly wrong, and because "no behaviour change" cannot sensibly extend to protecting a defect that the same release makes visible.
- **Keep the join, use `COUNT(DISTINCT factories.accountId)` and add `DISTINCT` to the page query (rejected).** Fixes the count and the duplicates without touching the filter's structure. Rejected because `DISTINCT` over the sixteen-column factory projection forces a sort or hash over wide rows on every request, and because the correctness of the result then depends on the projection never gaining a column that varies per enrollment — a trap for a future contributor.
- **Keep the join and always apply the fiscal-year filter (rejected).** Would constrain the join to one row per factory. Rejected because it silently changes what `enrolled=false` selects, which is a far larger semantic change than the one this ADR makes.
- **`EXISTS` subquery (chosen).** Removes the multiplication at its source rather than compensating for it downstream.

## Reasons

- **It fixes the cause, not the symptom.** The other viable option deduplicates rows that should never have been produced.
- **`meta.total` becomes correct by construction**, with no `DISTINCT` and no dependence on the projection's column list.
- **Page Stability is restored honestly.** The total order now applies to the entity the caller pages through.
- **It narrows the blast radius.** `enrolls` leaves the factory list projection entirely, so no future change to the enrollment table can perturb factory list cardinality.

## Consequences

- **Duplicate rows visible today will disappear.** A client that counted rows to display "N factories" will show a smaller, correct number. This is the intended repair and the reason this ADR exists rather than a silent code change.
- **A parity test is mandatory before merge.** It must assert that the set of distinct `accountId` values returned is identical to the current implementation's, for every combination of `validated` and `enrolled` across all three role-scoped variants. The row *count* will legitimately differ; the *set* must not.
- **The left/inner join asymmetry must be resolved explicitly.** It is currently an accident of three separately written queries. Construction must decide and document what the region and province variants do for a factory with no enrollment when `enrolled=false`.
- **Query plans change and must be measured.** `EXISTS` on `enrolls.factoryId` should perform at least as well as the join, but this must be confirmed with `EXPLAIN ANALYZE` before and after. Any index need is raised for human review, never migrated inside a bolt.
- **`docs/api-conventions.md` must note that factory lists no longer return duplicate rows**, so the change is discoverable by client owners rather than surfacing as an unexplained count difference.
