---
id: 025-list-pagination
unit: 001-list-pagination
intent: 012-list-pagination
type: ddd-construction-bolt
status: complete
stories:
  - 001-pagination-query-contract
  - 002-pagination-response-envelope
  - 003-deterministic-list-ordering
  - 004-factory-list-pagination
created: 2026-08-19T02:20:30.000Z
started: 2026-08-19T02:34:53.000Z
completed: "2026-08-19T14:18:17Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-08-19T12:05:41.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-08-19T12:28:18.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-08-19T13:33:13.000Z
    artifact: docs/adr/0007,0008,0009
  - name: implement
    completed: 2026-08-19T13:41:14.000Z
    artifact: src/schema/pagination.ts + factory service/schema/routes
requires_bolts: []
enables_bolts:
  - 026-list-pagination
  - 027-list-pagination
  - 028-list-pagination
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 025-list-pagination

## Overview

Establish the shared offset-pagination contract for the TWHP API and prove it end to end on the
three Factory list endpoints, which need no filter rewrite.

## Objective

Create one pagination query schema, one response envelope, and one page-building helper, then apply
them to the Factory registry lists. Add the deterministic total order that every later paginated
query will rely on. Finish with a contract that the Enrollment and Score Report bolts can adopt
without redesign.

## Stories Included

- **001-pagination-query-contract**: Shared `page` and `limit` query schema with defaults and bounds (Must)
- **002-pagination-response-envelope**: Shared `{ items, meta }` envelope and page builder (Must)
- **003-deterministic-list-ordering**: Total order on every paginated query (Must)
- **004-factory-list-pagination**: Paginate the three Factory list endpoints (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. Technical Design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis**: Pending/optional → likely required; the envelope is a deliberate, scoped exception to the project's no-wrapper convention
- [ ] **4. Implement**: Pending → shared schema module, page helper, Factory route and service changes
- [ ] **5. Test**: Pending → `ddd-03-test-report.md`

## Dependencies

### Requires

- No bolt dependency. This is the foundation bolt of the intent.

### Enables

- 026-list-pagination
- 027-list-pagination
- 028-list-pagination

## Expected Outputs

- A shared pagination schema module exporting the query schema, the envelope wrapper, and the
  metadata schema.
- A service-side page builder that computes `totalPages` in exactly one place.
- Three paginated Factory list endpoints with unchanged item shapes and filters.
- A deterministic total order applied to the Factory, Enrollment, and Score Report queries.
- Focused tests for defaults, bounds rejection, envelope shape, and page stability.

## Success Criteria

- [ ] All four stories satisfy every acceptance criterion.
- [ ] `page` and `limit` defaults, bounds, and rejection behave as specified.
- [ ] Factory list items keep their existing snake_case fields unchanged.
- [ ] `validated` and `enrolled` filters, role guards, and region and province scoping are unchanged.
- [ ] One count query and one page query per Factory list request.
- [ ] Every paginated query has a total order whose final sort key is unique.
- [ ] Code and artifacts reviewed.

## Notes

The Factory lists are first on purpose. They already carry a unique total order on `accountId` and
apply every filter in SQL, so they exercise the new contract without the risk of a query rewrite.
Any design weakness in the envelope surfaces here, where it is cheap to correct.

The envelope contradicts the project's stated no-wrapper convention for every other route. Treat
that as an explicit, documented exception and record it in the ADR analysis stage.
