---
id: 002-score-service
unit: 001-score-service
intent: 001-score-calculator-and-report
type: ddd-construction-bolt
status: complete
stories:
  - 004-factory-endpoint
  - 005-evaluator-endpoint
  - 006-provincial-endpoint
  - 007-admin-endpoint
created: 2026-06-03T00:00:00.000Z
started: 2026-06-03T00:00:00.000Z
completed: "2026-06-03T14:52:46Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-06-03T00:00:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-06-03T00:00:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-06-03T00:00:00.000Z
    artifact: none
  - name: implement
    completed: 2026-06-03T00:00:00.000Z
    artifact: src/routes/factories/assessments/score/index.ts, src/routes/evaluators/score/index.ts, src/routes/provincialOfficers/score/index.ts, src/routes/admins/score/index.ts
  - name: test
    completed: 2026-06-03T00:00:00.000Z
    artifact: ddd-03-test-report.md
requires_bolts:
  - 001-score-service
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 002-score-service

## Overview

Wire up the four role-scoped score endpoints using the service built in bolt 001. Each endpoint follows the existing route file pattern — guard, call service method, return typed response.

## Objective

Deliver four GET route files that expose score data to Factory, Evaluator, Provincial Officer, and DOED Admin, each with correct access control and typed responses.

## Stories Included

- **004-factory-endpoint**: `GET /twhp/api/factories/assessments/score` (Must)
- **005-evaluator-endpoint**: `GET /twhp/api/evaluators/score` (Must)
- **006-provincial-endpoint**: `GET /twhp/api/provincialOfficers/score` (Must)
- **007-admin-endpoint**: `GET /twhp/api/admins/score` with optional filters (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Route map — confirm paths, guards, service method signatures per role
- [ ] **2. design**: Technical design — ElysiaJS route structure, query param handling for admin, TypeBox response wiring
- [ ] **3. implement**: 4 route files + service methods `getScoreByFactory`, `getScoresByRegion`, `getScoresByProvince`, `getAllScores`
- [ ] **4. test**: Verify each endpoint returns correct scope, auth guard blocks unauthenticated, status guard propagates

## Dependencies

### Requires

- **001-score-service** (Required — provides `scoreService` singleton and `ScoreReportSchema`)

### Enables

- None (terminal bolt — feature complete after this)

## Success Criteria

- [ ] Factory endpoint returns single Score Report scoped to own cover
- [ ] Evaluator endpoint returns only factories in evaluator's region
- [ ] Provincial endpoint returns only factories in officer's province
- [ ] Admin endpoint supports optional `?region=` / `?provinceId=` filters
- [ ] All endpoints return 401 without valid JWT
- [ ] All endpoints return 400 for in_progress covers (propagated from service)

## Notes

- Route files use autoload pattern — new files automatically register routes
- Admin `?region` and `?provinceId` are optional query params (same pattern as `enrollService.getAllEnrolls`)
- `ElysiaCustomStatusResponse` check pattern for service return values (mirrors existing routes)
