---
id: 018-enroll-cover-filter
unit: 001-enroll-cover-filter
intent: 007-cover-status-filter
type: ddd-construction-bolt
status: complete
stories:
  - 001-cover-status-derivation-and-filter
  - 002-enroll-cover-response-schema
  - 003-enroll-routes-coverstatus-param
created: 2026-06-24T06:09:51.000Z
started: 2026-06-24T06:40:22.000Z
completed: "2026-06-24T07:24:36Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-06-24T06:44:19.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-06-24T06:50:04.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-06-24T07:09:31.000Z
    artifact: none (no ADR-worthy decisions)
  - name: implement
    completed: 2026-06-24T07:18:18.000Z
    artifact: src/service/enroll.ts, src/schema/enroll.ts, 3 enroll routes
  - name: test
    completed: 2026-06-24T07:24:14.000Z
    artifact: ddd-03-test-report.md
requires_bolts: []
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 018-enroll-cover-filter

## Overview

Add cover-status enrichment + an optional `coverStatus` filter to the three staff
enroll-list endpoints, with each enroll returning `coverId` + `coverStatus`.

## Objective

Implement, across the enroll domain (service → schema → routes), cover-status
derivation (latest-log-wins), an optional `coverStatus` query filter
(`finished | in_progress | in_review | none`) AND-combined with each endpoint's
existing scope, and a shared enriched response schema — all backward-compatible.

## Stories Included

- **001-cover-status-derivation-and-filter**: service enrichment + filter (Must)
- **002-enroll-cover-response-schema**: shared response schema coverId + coverStatus (Must)
- **003-enroll-routes-coverstatus-param**: query param wiring on 3 routes (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Pending → ddd-01-domain-model.md
- [ ] **2. design**: Pending → ddd-02-technical-design.md
- [ ] **3. adr**: Pending → adr-*.md (if a decision arises)
- [ ] **4. implement**: Pending → service/enroll.ts, schema, 3 routes
- [ ] **5. test**: Pending → ddd-03-test-report.md

## Dependencies

### Requires

- None (uses existing covers/coverLogs)

### Enables

- None (feature complete)

## Success Criteria

- [ ] All 3 stories implemented
- [ ] All acceptance criteria met (filter values, none, no-filter, invalid → 400, scope composition)
- [ ] Integration tests passing (no N+1)
- [ ] No change to existing enroll-list fields/ordering

## Notes

- Small, low-risk read-only enhancement; one DDD bolt is sufficient.
- Likely no ADR needed; the Stage-3 ADR step may be a no-op decision record.
- Preserve each endpoint's scope: admin (all), evaluator (region via
  `getAllEnrolls(region, …)`), provincial (`getAllEnrollsByProvince(provinceId, …)`).
