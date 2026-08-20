---
id: 028-list-pagination
unit: 001-list-pagination
intent: 012-list-pagination
type: ddd-construction-bolt
status: complete
stories:
  - 010-pagination-contract-documentation
  - 011-pagination-regression-coverage
created: 2026-08-19T02:20:30.000Z
started: 2026-08-20T06:12:57.000Z
completed: "2026-08-20T07:18:28Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-08-20T06:11:37.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-08-20T07:02:11.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-08-20T07:02:11.000Z
    artifact: null
    note: skipped by user - decisions already recorded by ADR-0007/0008/0010
  - name: implement
    completed: 2026-08-20T07:21:40.000Z
    artifact: docs + 2 new test files
requires_bolts:
  - 025-list-pagination
  - 026-list-pagination
  - 027-list-pagination
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 028-list-pagination

## Overview

Correct the API documentation to match the shipped pagination contract and complete the regression
and parity coverage that protects it.

## Objective

Replace the "There is no pagination contract" statement and the surrounding parameter and ordering
sections in `docs/api-conventions.md` with the implemented contract, verify the OpenAPI schemas, and
land the boundary, stability, and parity tests that span all three resource families and all three
staff roles.

## Stories Included

- **010-pagination-contract-documentation**: Correct API conventions and OpenAPI (Must)
- **011-pagination-regression-coverage**: Boundary, stability, and parity test coverage (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. Domain Model**: ✅ Complete → `ddd-01-domain-model.md`
- [x] **2. Technical Design**: ✅ Complete → `ddd-02-technical-design.md`
- [x] **3. ADR Analysis**: ⏭️ Skipped by user → not expected; the contract decision is recorded by bolt 025
- [x] **4. Implement**: ✅ Complete → documentation corrections and test suites
- [x] **5. Test**: ✅ Complete → `ddd-03-test-report.md`

## Dependencies

### Requires

- **025-list-pagination** (Required): Factory lists paginated
- **026-list-pagination** (Required): Enrollment lists paginated
- **027-list-pagination** (Required): Score Report lists paginated

### Enables

- None; terminal bolt of the intent.

## Expected Outputs

- `docs/api-conventions.md` describing parameters, defaults, maximum, 1-indexed pages, the envelope,
  the implemented orderings, and the scope boundary.
- An explicit breaking-change notice naming all nine endpoints.
- `docs/handover.md` updated so its known-limitations entry no longer contradicts the shipped code.
- Verified OpenAPI `query` and `200` schemas on all nine routes.
- Boundary tests: defaults, bounds rejection, last partial page, page beyond the end, empty set.
- Page-stability tests proving each row appears exactly once across all pages.
- Parity tests for both SQL rewrites, across all three roles.

## Success Criteria

- [ ] Both stories satisfy every acceptance criterion.
- [ ] No documentation statement contradicts the shipped behavior.
- [ ] `memory-bank/standards/api-conventions.md` and the implementation agree on defaults.
- [ ] Tests cover `total` and `totalPages` correctness under both filters.
- [ ] Tests assert the envelope explicitly, so a return to a bare array fails.
- [ ] Focused tests pass; integration tests pass or are reported as skipped with the reason.
- [ ] Non-mutating Biome diagnostics reported as baseline versus introduced findings.
- [ ] Code and artifacts reviewed.

## Notes

Documentation is a deliverable of this intent, not an afterthought. `docs/api-conventions.md`
currently records the pre-pagination reality in several places, so review the whole parameters,
filtering, and ordering section rather than editing one sentence.

Before this bolt closes, confirm the release-order decision recorded in `requirements.md`. The
confirmed full-data need is served by a dedicated export API path in a separate intent, not by
anything in this intent. If pagination releases before that export path exists, the full-data
consumer is silently truncated to twenty rows with no error for the length of the gap. Confirm the
gap is accepted and does not fall inside fiscal year-end reporting.
