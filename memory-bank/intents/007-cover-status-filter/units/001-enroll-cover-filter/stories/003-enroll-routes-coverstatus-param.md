---
id: 003-enroll-routes-coverstatus-param
unit: 001-enroll-cover-filter
intent: 007-cover-status-filter
status: complete
priority: must
created: 2026-06-24T06:09:51.000Z
assigned_bolt: 018-enroll-cover-filter
implemented: true
---

# Story: 003-enroll-routes-coverstatus-param

## User Story

**As a** staff user
**I want** to pass `?coverStatus=` to my enroll-list endpoint
**So that** the server returns only the enrolls whose cover matches, within my scope

## Acceptance Criteria

- [ ] **Given** `GET /admins/enrolls`, `GET /evaluators/enrolls`, `GET /provincialOfficers/enrolls`, **When** each declares its query, **Then** it accepts an optional `coverStatus` of `t.Union(finished | in_progress | in_review | none)`.
- [ ] **Given** `coverStatus` is omitted, **When** the endpoint runs, **Then** it returns the same enroll set as today within its scope (plus the new nullable fields) — behaviour-preserving.
- [ ] **Given** a `coverStatus` value not in the allowed set, **When** the request is made, **Then** the endpoint responds `400` (TypeBox) before any DB work.
- [ ] **Given** a valid `coverStatus`, **When** the route handler runs, **Then** it forwards the value to the service (admin → `getAllEnrolls(undefined, undefined, coverStatus)`; evaluator → `getAllEnrolls(region, undefined, coverStatus)`; provincial → `getAllEnrollsByProvince(provinceId, coverStatus)`).
- [ ] **Given** an evaluator/provincial caller, **When** filtering, **Then** results never include enrolls outside their region/province (scope preserved).
- [ ] **Given** the responses, **When** declared, **Then** all three use the shared extended schema from story 002.

## Technical Notes

- Edit `src/routes/admins/enrolls/index.ts`, `src/routes/evaluators/enrolls/index.ts`, `src/routes/provincialOfficers/enrolls/index.ts`.
- Add `query: t.Object({ coverStatus: t.Optional(t.Union([...])) })` to each route's options.
- Keep the existing guard wiring and 404 responses (evaluator/provincial resolve their scope from JWT).
- Evaluator route already maps to `getAllEnrolls(region)`; thread `coverStatus` as the 3rd arg.

## Dependencies

### Requires

- 001-cover-status-derivation-and-filter (service accepts the param)
- 002-enroll-cover-response-schema (shared response schema)

### Enables

- None (feature complete)

## Edge Cases

| Scenario | Expected Behavior |
| -------- | ----------------- |
| `coverStatus=` empty string | TypeBox rejects (not in union) → 400 |
| `coverStatus=FINISHED` (wrong case) | Rejected → 400 (values are exact) |
| Evaluator with no region / not an evaluator | Existing 404 path unchanged |

## Out of Scope

- Multi-value filtering.
- Adding region/provinceId params to the admin endpoint.
