---
id: 030-fiscal-year-reads
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
type: ddd-construction-bolt
status: planned
stories:
  - 003-staff-list-fiscal-year-addressing
  - 004-factory-self-read-fiscal-year-addressing
  - 005-fiscal-year-in-responses
created: 2026-08-20T08:55:00Z
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts:
  - 029-fiscal-year-reads
enables_bolts:
  - 031-fiscal-year-reads
  - 034-out-of-year-writes
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 4
---

# Bolt: 030-fiscal-year-reads

## Overview

Thread the resolved fiscal-year window through every fiscal-scoped read path, and return the
resolved year with the data.

## Objective

Make the nine staff list endpoints and the four Factory self-read paths accept `fiscalYear`, keeping
role scoping, filters, pagination, and response shapes exactly as they are when the parameter is
omitted — then add the Common Era `fiscalYear` to the affected responses.

## Stories Included

- **003-staff-list-fiscal-year-addressing**: Enrollment, Factory, and Score Report lists (Must)
- **004-factory-self-read-fiscal-year-addressing**: enrollment, cover, answers, score (Must)
- **005-fiscal-year-in-responses**: CE `fiscalYear` on fiscal-scoped responses (Should)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model** → `ddd-01-domain-model.md`
- [ ] **2. Technical Design** → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis**
- [ ] **4. Implement**
- [ ] **5. Test** → `ddd-03-test-report.md`

## Dependencies

### Requires

- **029-fiscal-year-reads** (Required): resolver and query schema

### Enables

- **031-fiscal-year-reads**: parity and boundary coverage over these paths
- **034-out-of-year-writes**: concurrent-open-year disambiguation constrains these self-reads

## Expected Outputs

- `fiscalYear` accepted on `/admins/enrolls`, `/evaluators/enrolls`, `/provincialOfficers/enrolls`,
  `/admins/factories`, `/evaluators/factories`, `/provincialOfficers/factories`, `/admins/score`,
  `/evaluators/score`, `/provincialOfficers/score`.
- `fiscalYear` accepted on `/factories/enrolls`, `/factories/assessments`, and
  `/factories/assessments/score`.
- The resolved window threaded through `listEnrolls`, `listScoreReports`, the Factory list path, and
  the four self-read services, with no service constructing date boundaries itself.
- Count and page queries sharing one predicate, so `meta.total` and the page agree.
- CE `fiscalYear` on enrollment, cover, score, and list-item responses.
- Updated OpenAPI query and response schemas.

## Success Criteria

- [ ] All three stories satisfy every acceptance criterion.
- [ ] Every touched endpoint called without `fiscalYear` returns a byte-identical response.
- [ ] Role scoping unchanged for every role, on every path, for any addressed year.
- [ ] A valid year with no data returns an empty page at 200, never a 404.
- [ ] The `EXISTS` predicate on the Factory list from `012` is preserved, not reverted to a join.
- [ ] `enrolled=false` retains its existing filter-disabling semantics.
- [ ] No service hand-rolls a fiscal-year boundary.
- [ ] No database schema change of any kind.
- [ ] Code and artifacts reviewed.

## Notes

The compatibility NFR — zero response change when `fiscalYear` is omitted — is the hard constraint of
this bolt, and it is easy to break accidentally while threading a parameter through thirteen call
sites.

Two known traps. The Factory list uses a correlated `EXISTS` rather than an `enrolls` join
specifically because the join multiplied rows and corrupted `meta.total`; the decision-index records
this. Threading a window is exactly the kind of edit that tempts a return to a join. Separately,
`enrolled=false` currently disables the fiscal-year date filter altogether — `012` deliberately left
that semantic alone, and so does this bolt; document the interaction with `fiscalYear` rather than
quietly rationalising it.

Story 005 must derive the response year from the same helper that produced the filter window. Two
derivations can disagree at a boundary, which would let a row be selected as one year and displayed
as another — the precise failure this intent exists to reduce.
