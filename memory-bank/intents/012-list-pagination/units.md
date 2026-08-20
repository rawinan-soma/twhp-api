---
intent: 012-list-pagination
phase: inception
status: inception-complete
updated: 2026-08-19T02:20:30Z
---

# List Pagination - Unit Decomposition

## Project Type

`backend-api`, using the catalog's domain-driven backend decomposition and
`ddd-construction-bolt`. No frontend unit is created; the frontend is an external consumer that must
migrate, not a unit this repository builds.

## Units Overview

This intent contains one cohesive backend unit.

### Unit 1: `001-list-pagination`

**Description**: Introduce one shared offset-pagination contract, apply it to the nine unbounded
staff list endpoints, and push the two JavaScript-side list filters down into SQL so that page
contents and result counts are correct.

**Assigned Requirements**: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8

**Deliverables**:

- A shared pagination query schema, response envelope schema, and page-building helper.
- Nine paginated list endpoints across the Factory, Enrollment, and Score Report read paths.
- Two SQL rewrites: the Enrollment Cover-status filter and the Score Report status filter.
- A page-scoped Answer read on the Score Report path.
- A deterministic total order on every paginated query.
- Corrected API convention documentation and OpenAPI schemas.
- Regression and parity test coverage.

**Dependencies**:

- Existing Score Report capability from intent `001-score-calculator-and-report`.
- Existing Cover-status filter capability from intent `007-cover-status-filter`.
- Existing finished-only Grade rule from intent `011-finished-cover-reward-guard`, which the Score
  Report rewrite must preserve.
- All three dependencies are already implemented; no active construction bolt is blocked.

**Estimated Complexity**: Medium

## Requirement-to-Unit Mapping

- **FR-1** Shared pagination query contract → `001-list-pagination`
- **FR-2** Standard pagination response envelope → `001-list-pagination`
- **FR-3** Deterministic total ordering for stable pagination → `001-list-pagination`
- **FR-4** Cover-status filter pushed down to SQL for Enrollment lists → `001-list-pagination`
- **FR-5** Score Report status filter pushed down and Answer fan-out scoped to the page → `001-list-pagination`
- **FR-6** Existing filters, authorization, and scoping unchanged → `001-list-pagination`
- **FR-7** Documentation and OpenAPI reflect the new contract → `001-list-pagination`
- **FR-8** Pagination regression coverage → `001-list-pagination`

## Unit Dependency Graph

```text
001-score-calculator-and-report (complete) ─┐
007-cover-status-filter (complete) ─────────┼─> 001-list-pagination
011-finished-cover-reward-guard (complete) ─┘
```

## Execution Order

1. Execute the single `001-list-pagination` unit across four sequenced bolts.

## Why One Unit

The decisive criterion is deployability. The approved contract decision is a clean break: all nine
endpoints change response shape at once, and the frontend cuts over in the same release. Endpoints
that must ship together are not independently deployable, so they cannot be separate units.

Cohesion supports the same conclusion. All nine endpoints share one query schema, one envelope
schema, and one page-building helper. Splitting the Factory, Enrollment, and Score Report paths into
separate units would divide a single contract across artificial boundaries and invite three
divergent implementations of the same envelope.

Sequencing is still needed, because the two SQL rewrites carry materially more risk than the shared
contract. That sequencing is expressed as four bolts inside this one unit, not as separate units.
