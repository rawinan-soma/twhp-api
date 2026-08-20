---
unit: 001-list-pagination
bolt: 028-list-pagination
stage: model
status: complete
updated: 2026-08-20T06:11:37Z
---

# Static Model - Documentation Correction + Cross-Cutting Regression Coverage

## A note on this stage

This bolt introduces **no domain content**. It adds no entity, no value object, no service, no
repository, and no rule. Bolts 025–027 established the whole model; this bolt corrects what the
documentation says about it and closes the gaps in its test coverage.

Writing a speculative domain model here would be padding. The bolt was typed
`ddd-construction-bolt` during inception for consistency with its siblings; `simple-construction-bolt`
would have been the more honest choice, and that is worth recording for the next intent that plans a
documentation bolt.

What this stage *can* usefully produce is the thing the bolt actually needs before it starts: a
complete **inventory** of what is now false and what is now untested. That inventory is below, and it
already contains one item nobody was tracking.

## Bounded Context

Unchanged: **Staff List Presentation**, as defined in bolt 025 and extended by 026 and 027. This
bolt's outputs are documentation and tests, both of which describe that context rather than adding
to it.

## Inventory A — documentation claims the intent has falsified

| # | Location | Claim | Status |
|---|----------|-------|--------|
| A1 | `docs/api-conventions.md:129` | *"There is no pagination contract. List routes return complete arrays and do not accept `page`, `limit`, or cursor parameters."* | **False** for the nine staff list endpoints. Still **true** for every other route, and deliberately so (ADR-0007). The replacement must state both halves, or the next contributor will wrap everything. |
| A2 | `docs/api-conventions.md:131-137` | The explicit-ordering list, ending *"Other list ordering is not guaranteed."* | **Incomplete and now misleading.** Enrollment lists gained a unique `id` tiebreaker; score reports gained an explicit order where they previously had **none**. A total order is now a contract for all nine, not an incidental property. |
| A3 | `docs/api-conventions.md:145` | *"evaluator and provincial variants still inner-join enrollment rows"* | **False.** ADR-0008 replaced that join with an `EXISTS` predicate. The *selection semantics* were preserved — those variants still require at least one enrollment — but the mechanism described no longer exists, and its duplicate-row consequence is gone. |
| A4 | `docs/handover.md:81` | *"Lists are unpaginated and some ordering is incidental."* | **False** for the nine. |
| A5 | `docs/handover.md:166` | Open question: *"What are the maximum data volumes, pagination/order contracts…"* | **Partially answered** for staff lists. The volume question remains open. |
| A6 | `memory-bank/standards/api-conventions.md` | Offset pagination, `?page=1&limit=20`, *"Limit defaults to be defined per-endpoint."* | **Under-specified rather than false.** Implementation settled on default 20, min 1, max 100, uniform across all nine. The standard should record the actual numbers and the envelope shape. |

**A3 is the item nobody was tracking.** Every plan and checkpoint in this intent referred to "the
`no pagination contract` sentence" as though it were the only falsehood. A read of the surrounding
section found two more. The construction stage must review the whole *Parameters, filtering, and
ordering* section, not the one sentence everyone remembers.

### Claims deliberately left alone

| Location | Claim | Why unchanged |
|----------|-------|---------------|
| `docs/api-conventions.md:145` | *"`enrolled=false` … disables the current-fiscal-year enrollment-date filter"* | Still true. The intent explicitly preserved this confusing semantic rather than repairing it. The warning that it is "current implementation behavior, not a stable semantic contract" remains accurate and should stay. |
| `docs/handover.md` | Production promotion, backup and rollback warnings | Untouched by this intent, and still true. |

## Inventory B — contract surfaces with no test

| # | Surface | Gap | Owner |
|---|---------|-----|-------|
| B1 | Existing `404` responses on paginated routes | **No assertion anywhere** that `404 invalid evaluator` and `404 provincial officer not found` are returned **unwrapped**. Carried as an open item since bolt 025. A change that wrapped them would pass every existing test. | Story 011 |
| B2 | `PaginationQuery` composition | Bolt 025 proved the schema rejects out-of-range values, but nothing asserts that all **nine** routes actually compose it. A route that forgot it would silently return an unbounded first page. | Story 011 |
| B3 | Envelope parity across roles and families | Bolt 027 asserted it for the three score variants. The factory and enrollment families were verified per-endpoint but never compared **across** all three roles in one assertion. | Story 011 |
| B4 | OpenAPI document | Never inspected. The generated `query` and `200` schemas for the nine routes are assumed correct because they derive from route definitions. Assumption, not evidence. | Story 010 |

**B1 and B2 are the two that could hide a real regression.** B3 is consistency assurance; B4 is
verification of a generated artifact.

## Domain Entities, Value Objects, Aggregates, Events, Services, Repositories

**None.** All are inherited unchanged from bolts 025–027. This bolt adds no member to any of them.

## Ubiquitous Language

No new terms. This bolt's obligation is the inverse: the documentation it produces must use the
vocabulary the intent already established, so that `docs/` and `memory-bank/` agree.

The terms the corrected documentation must use, and use consistently:

| Term | Source |
|------|--------|
| Page, Limit, Offset, Total, Total Pages, Envelope, Meta, Total Order, Page Stability, Empty Page | bolt 025 |
| Cover Status, latest-log-wins, `none` as an absence test, Filter pushdown, Membership | bolt 026 |
| Scorable Cover, Two-phase read, Hydration, Fan-out | bolt 027 |

Terms that must **not** appear, because the intent deliberately excluded them: *cursor*,
*hasNext*/*hasPrev*, *paginated answers*, *cached score*.

## Story Coverage

| Story | Covered by |
|-------|-----------|
| 010-pagination-contract-documentation | Inventory A (A1–A6), B4, and the vocabulary table |
| 011-pagination-regression-coverage | Inventory B (B1–B3) |

## Findings

1. **The documentation debt is three claims, not one.** A3 in particular is subtle: the sentence
   describes a mechanism that no longer exists, while the behaviour it implies is still correct. A
   reader would form an accurate expectation from an inaccurate explanation — which survives review
   precisely because nothing looks wrong.

2. **B1 and B2 are the only gaps that could conceal a regression.** Everything else in Inventory B is
   assurance. Construction should weight them accordingly rather than treating four gaps as equal.

3. **This bolt should have been a `simple-construction-bolt`.** Recorded so the next intent that
   plans a documentation bolt types it honestly, rather than producing a domain model that says
   "no domain content" — as this one does.

4. **Two items must survive this intent as open work**, and the closing documentation should say so
   rather than implying the intent finished everything: the three remaining latest-log-wins
   duplicates in `answer.ts` and `cover.ts`, and the absence of any migration for the
   `idx_coverlogs_cover_id_id` index that two bolts now depend on.
