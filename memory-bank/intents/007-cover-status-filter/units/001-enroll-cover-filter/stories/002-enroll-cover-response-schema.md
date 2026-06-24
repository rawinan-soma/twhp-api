---
id: 002-enroll-cover-response-schema
unit: 001-enroll-cover-filter
intent: 007-cover-status-filter
status: complete
priority: must
created: 2026-06-24T06:09:51.000Z
assigned_bolt: 018-enroll-cover-filter
implemented: true
---

# Story: 002-enroll-cover-response-schema

## User Story

**As a** frontend consumer of the enroll lists
**I want** each enroll to expose its `coverId` and `coverStatus`
**So that** I can show cover progress and deep-link to the cover without a second call

## Acceptance Criteria

- [ ] **Given** the enroll-list response item schema, **When** extended, **Then** it adds `coverId: number | null` and `coverStatus: ("finished" | "in_progress" | "in_review") | null`.
- [ ] **Given** the three endpoints, **When** they declare their response, **Then** they all reference one shared extended schema (no per-route drift).
- [ ] **Given** the existing fields (enroll columns, `factory_name_th`, `region`, `provinceId`), **When** the schema is extended, **Then** none are removed or renamed.
- [ ] **Given** a no-cover enroll, **When** serialized, **Then** `coverId` and `coverStatus` are `null` (the `none` filter value has no stored counterpart).

## Technical Notes

- Define the shared item schema near `BaseEnrollSelect` (in `schema/enroll.ts` or alongside the existing `t.Composite([...])` used in the three routes).
- `coverStatus` enum values must match the `coverStatus` pgEnum (`finished | in_progress | in_review`); nullable via `t.Nullable`.
- Today each route inlines `t.Composite([BaseEnrollSelect, t.Object({ factory_name_th, region, provinceId })])` — consolidate into one exported schema and reuse.

## Dependencies

### Requires

- 001-cover-status-derivation-and-filter (produces the fields)

### Enables

- 003-enroll-routes-coverstatus-param (routes adopt the shared schema)

## Edge Cases

| Scenario | Expected Behavior |
| -------- | ----------------- |
| Validation of a row with null coverId | Passes (field is nullable) |
| Extra unknown field in service output | Schema strips/validates per existing Elysia behaviour |

## Out of Scope

- The query-param schema (story 003).
- Service derivation logic (story 001).
