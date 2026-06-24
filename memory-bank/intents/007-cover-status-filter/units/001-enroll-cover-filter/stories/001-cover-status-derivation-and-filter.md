---
id: 001-cover-status-derivation-and-filter
unit: 001-enroll-cover-filter
intent: 007-cover-status-filter
status: complete
priority: must
created: 2026-06-24T06:09:51.000Z
assigned_bolt: 018-enroll-cover-filter
implemented: true
---

# Story: 001-cover-status-derivation-and-filter

## User Story

**As a** staff caller of the enroll-list endpoints
**I want** the service to derive each enroll's cover status and filter by it
**So that** I can fetch only enrolls whose cover is in a given status

## Acceptance Criteria

- [ ] **Given** an enroll whose cover has logs, **When** the list is built, **Then** the row carries `coverId` = that cover's id and `coverStatus` = the latest (highest-`id`) `coverLogs.status`.
- [ ] **Given** an enroll with no cover, **When** the list is built, **Then** `coverId = null` and `coverStatus = null`.
- [ ] **Given** `coverStatus = finished|in_progress|in_review`, **When** the filter is applied, **Then** only enrolls whose cover's latest status equals it are returned (no-cover enrolls excluded).
- [ ] **Given** `coverStatus = none`, **When** the filter is applied, **Then** only enrolls with no cover are returned.
- [ ] **Given** no `coverStatus`, **When** the list is built, **Then** all in-scope enrolls (incl. no-cover) are returned, enriched with the new fields.
- [ ] **Given** the filter, **When** combined with the method's existing region/province + fiscal-year scope, **Then** the filter narrows that scoped set and never widens it (AND-composition).

## Technical Notes

- Implement in `service/enroll.ts` on `getAllEnrolls(region?, provinceId?, coverStatus?)` and `getAllEnrollsByProvince(provinceId, coverStatus?)`.
- Enrichment must be ≤ 2 bounded queries over the enroll set (covers by `enrollId IN (...)`, then latest `coverLogs` via `selectDistinctOn([coverLogs.coverId]).orderBy(coverLogs.coverId, desc(coverLogs.id))`), then map in JS — mirror `score.ts buildScoreReports`. No per-row query.
- Apply the `coverStatus` filter in JS after enrichment (or push into SQL if clean), preserving `desc(enrolls.enrollDate)` ordering.
- `none` maps to "no cover" (coverId/coverStatus null).

## Dependencies

### Requires

- None

### Enables

- 002-enroll-cover-response-schema (shape of the new fields)
- 003-enroll-routes-coverstatus-param (routes pass the param in)

## Edge Cases

| Scenario | Expected Behavior |
| -------- | ----------------- |
| Cover exists but has zero coverLogs rows | Treat as `coverStatus = null` (won't match a real-status filter) |
| Enroll set is empty | Return `[]` without running enrichment queries |
| Multiple covers for one enroll (should not happen) | Use latest-log-wins within each; documented assumption is 1 cover/enroll |

## Out of Scope

- Route-level query param parsing/validation (story 003).
- Response TypeBox schema definition (story 002).
