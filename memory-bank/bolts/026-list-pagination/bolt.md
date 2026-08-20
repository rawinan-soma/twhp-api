---
id: 026-list-pagination
unit: 001-list-pagination
intent: 012-list-pagination
type: ddd-construction-bolt
status: complete
stories:
  - 005-cover-status-sql-pushdown
  - 006-enrollment-list-pagination
created: 2026-08-19T02:20:30.000Z
started: 2026-08-19T14:30:03.000Z
completed: "2026-08-20T02:43:08Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-08-20T01:51:58.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-08-20T02:09:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-08-20T02:13:20.000Z
    artifact: docs/adr/0010
  - name: implement
    completed: 2026-08-20T02:27:49.000Z
    artifact: src/service/coverStatus.ts + enroll service/schema/routes
requires_bolts:
  - 025-list-pagination
enables_bolts:
  - 028-list-pagination
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 026-list-pagination

## Overview

Move the Enrollment Cover-status filter from JavaScript into SQL, then paginate the three Enrollment
list endpoints.

## Objective

Rewrite `enrichAndFilterCovers` so PostgreSQL resolves each Enrollment's current Cover status and
applies the `coverStatus` filter inside the query. Prove membership parity against the current
implementation, then apply the shared pagination contract to the Admin, Evaluator, and Provincial
Officer Enrollment lists.

## Stories Included

- **005-cover-status-sql-pushdown**: Resolve and filter Cover status in SQL, latest-log-wins (Must)
- **006-enrollment-list-pagination**: Paginate the three Enrollment list endpoints (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. Technical Design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis**: Pending/optional → only if the latest-log-wins SQL pattern becomes a standing convention worth recording
- [ ] **4. Implement**: Pending → SQL rewrite, then Enrollment route and service pagination
- [ ] **5. Test**: Pending → `ddd-03-test-report.md`

## Dependencies

### Requires

- **025-list-pagination** (Required): supplies the query schema, envelope, page helper, and the
  Enrollment total order.

### Enables

- 028-list-pagination

## Expected Outputs

- A single Enrollment query that resolves current Cover status and filters on it in SQL.
- Removal of the two JavaScript filter lines, only after parity tests pass.
- Three paginated Enrollment list endpoints with unchanged item projections.
- A reusable latest-log-wins SQL pattern that bolt 027 adopts rather than reinventing.
- Membership parity tests covering all four `coverStatus` values and the unfiltered case.

## Success Criteria

- [ ] Both stories satisfy every acceptance criterion.
- [ ] Cover status is resolved by greatest `CoverLogs.id`, never by timestamp.
- [ ] `coverStatus=finished|in_progress|in_review` returns identical membership to the current code.
- [ ] `coverStatus=none` returns exactly the Enrollments with no Cover.
- [ ] `meta.total` matches the filtered set, and a filtered page holds up to `limit` items.
- [ ] No Enrollment item field added, removed, renamed, or recased.
- [ ] Fiscal-year scoping and role guards unchanged.
- [ ] Code and artifacts reviewed.

## Notes

This is the first of the two risky rewrites. A membership change here produces no error; staff would
simply see a different list. Write the parity tests first and keep the JavaScript path available
until they pass.

If the new query needs an index, raise it for human review. Do not add a migration inside this bolt.
