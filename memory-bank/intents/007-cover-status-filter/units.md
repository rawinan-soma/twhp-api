---
intent: 007-cover-status-filter
phase: inception
status: units-decomposed
updated: 2026-06-24T06:09:51Z
---

# Cover Status Filter - Unit Decomposition

## Units Overview

This intent decomposes into **1 unit** of work. It is a small, cohesive backend
enhancement confined to the enroll domain (`service/enroll.ts`,
`schema/enroll.ts` / `schema/index.ts`, and the three enroll route files).

### Unit 1: 001-enroll-cover-filter

**Description**: Add cover-status enrichment + filtering to the three staff
enroll-list endpoints. Derives each enroll's cover (`coverId` + `coverStatus`)
via latest-log-wins, accepts an optional `coverStatus` query filter
(`finished | in_progress | in_review | none`) AND-combined with each endpoint's
existing scope, and surfaces the new fields in a shared response schema.

**Stories**:

- 001-cover-status-derivation-and-filter: service-layer enrichment + filter
- 002-enroll-cover-response-schema: shared response schema with coverId + coverStatus
- 003-enroll-routes-coverstatus-param: query param wiring across the 3 routes

**Deliverables**:

- Extended `getAllEnrolls` / `getAllEnrollsByProvince` in `service/enroll.ts`
- Extended enroll response schema (coverId + coverStatus nullable)
- `coverStatus` query param on `admins`, `evaluators`, `provincialOfficers` enroll routes
- Integration tests for filter + enrichment + scope composition

**Dependencies**:

- Depends on: none (uses existing covers/coverLogs)
- Depended by: none

**Estimated Complexity**: S

## Requirement-to-Unit Mapping

- **FR-1** (coverStatus query param + AND-composition) → `001-enroll-cover-filter`
- **FR-2** (status derivation, latest-log-wins, no-cover handling) → `001-enroll-cover-filter`
- **FR-3** (response enrichment coverId + coverStatus) → `001-enroll-cover-filter`
- **FR-4** (backward compatibility) → `001-enroll-cover-filter`

## Unit Dependency Graph

```text
[001-enroll-cover-filter]   (standalone)
```

## Execution Order

1. `001-enroll-cover-filter` — single unit, single bolt (`018-enroll-cover-filter`)
