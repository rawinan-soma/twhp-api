---
intent: 007-cover-status-filter
phase: inception
status: complete
created: 2026-06-24T06:09:51.000Z
updated: 2026-06-24T06:35:49.000Z
---

# Requirements: Cover Status Filter on GET All Enrolls

## Intent Overview

Add the ability to filter the staff enroll-listing endpoints by the status of
each enroll's assessment **cover** (`finished | in_progress | in_review | none`),
and enrich every returned enroll with its `coverId` + `coverStatus`. Today these
endpoints join only `enrolls → factories → provinces` and never touch
`covers`/`coverLogs`, so there is no way to ask for "all enrolls whose cover is
finished," and the client cannot see cover progress without a second call.

The new `coverStatus` filter is **additive** — it is AND-combined with each
endpoint's existing scope (evaluator's health region, provincial officer's
province) and fiscal-year scoping, never replacing them.

## Business Goals

| Goal | Success Metric | Priority |
| ---- | -------------- | -------- |
| Retrieve enrolls by cover progress | A caller gets only enrolls whose cover is `finished` (or another status, incl. `none` for not-started) in one query | Must |
| Surface cover progress inline | Each enroll row carries its `coverStatus` + `coverId` so the UI shows progress and can deep-link to the cover | Must |
| Combine with existing scope | The cover filter is AND-combined with each endpoint's region/province scope, not a replacement | Must |
| Preserve existing behaviour | Calls without the new param return the same enroll set as today (plus the additive fields) | Must |

---

## Scope (from Checkpoint 1)

**In scope** — the three staff enroll-list endpoints:

| Endpoint | Guard | Current service call |
| -------- | ----- | -------------------- |
| `GET /twhp/api/admins/enrolls` | DOED | `getAllEnrolls()` |
| `GET /twhp/api/evaluators/enrolls` | Evaluator | `getAllEnrolls(region)` |
| `GET /twhp/api/provincialOfficers/enrolls` | Provincial | `getAllEnrollsByProvince(provinceId)` |

**Out of scope (Won't):**

- Factory enroll endpoint (`getEnrollByFactoryId`) — a factory has one enroll.
- Adding region/provinceId query params to the admin enroll endpoint (only `coverStatus` is added here).
- Multi-value / comma-separated status filtering (single status value only this iteration).

---

## Functional Requirements

### FR-1: `coverStatus` query parameter on the three staff enroll lists

- **Description**: Each of the three endpoints accepts an **optional** `coverStatus`
  query parameter. Allowed values: `finished`, `in_progress`, `in_review`, `none`
  (`none` = enroll has no cover yet / not started). When present, the filter is
  **AND-combined** with the endpoint's existing scope and fiscal-year window —
  it narrows, never replaces, the existing result.
- **Acceptance Criteria**:
  - Given `coverStatus` is omitted, the endpoint returns the same enroll set as today (within its existing scope + fiscal year) — including no-cover enrolls — now with the additive fields from FR-3.
  - Given `coverStatus=finished` (or `in_progress` / `in_review`), only enrolls whose cover's latest status equals the value are returned; no-cover enrolls are excluded.
  - Given `coverStatus=none`, only enrolls with **no cover** are returned (`coverStatus`/`coverId` null).
  - Given a `coverStatus` value not in the allowed set, the endpoint responds `400` (TypeBox enum validation), before any DB work.
  - The filter is applied **on top of** each endpoint's existing scope: admin = all enrolls; evaluator = its health region; provincial = its province — plus fiscal-year scoping. A scoped endpoint never returns enrolls outside its region/province just because they match `coverStatus`.
- **Priority**: Must
- **Related Stories**: TBD

### FR-2: Cover-status derivation (latest log wins) and no-cover handling

- **Description**: An enroll's cover status is the status of the **latest**
  `coverLogs` row for that enroll's single cover, consistent with the existing
  latest-log-wins pattern (`score.ts`, `cover.ts`).
- **Acceptance Criteria**:
  - For an enroll whose cover has logs, `coverStatus` = the status of the highest-`id` `coverLogs` row for that cover, and `coverId` = that cover's id.
  - For an enroll with **no cover**, `coverStatus = null` and `coverId = null`.
  - No-cover enrolls are **included** in the unfiltered result, and are matched by `coverStatus=none`; they are excluded only when filtering by a real status (`finished`/`in_progress`/`in_review`).
  - One cover per enroll per fiscal year is assumed (enforced by `cover.ts create`), so no multi-cover tie-breaking is required beyond latest-log-wins within that one cover.
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Response enrichment with `coverId` + `coverStatus`

- **Description**: Each enroll object in all three endpoints' responses gains two
  fields: `coverId` and `coverStatus`.
- **Acceptance Criteria**:
  - Response item schema adds `coverId: number | null` and `coverStatus: ("finished" | "in_progress" | "in_review") | null`.
  - `none` is a **query-only** value: it has no stored counterpart — a no-cover enroll is represented in the response as `coverStatus: null`, `coverId: null`.
  - All existing fields (enroll columns, `factory_name_th`, `region`, `provinceId`) are unchanged and still present.
  - The three endpoints share one extended response schema (no per-endpoint drift).
- **Priority**: Must
- **Related Stories**: TBD

### FR-4: Backward compatibility

- **Description**: The change is purely additive for callers that don't use the new param.
- **Acceptance Criteria**:
  - No existing field is removed or renamed; ordering (`desc(enrolls.enrollDate)`) is preserved.
  - Existing enroll-list integration/behaviour for the no-param case is unchanged except for the two new nullable fields.
- **Priority**: Must
- **Related Stories**: TBD

---

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
| ----------- | ------ | ------ |
| No N+1 on enrichment | Extra queries per request | ≤ 2 bounded queries (covers + latest coverLogs) over the enroll set, mirroring `score.ts buildScoreReports`; no per-row query |

### Compatibility

- Absent `coverStatus` → behaviour-preserving (additive fields only).

### Consistency

- Reuse `utilities().getFiscalYear()` for fiscal scoping (project rule).
- Reuse the latest-log-wins idiom (`selectDistinctOn([coverLogs.coverId], …).orderBy(coverLogs.coverId, desc(coverLogs.id))`).

---

## Constraints

### Technical Constraints

**Intent-specific constraints:**

- The evaluator endpoint currently reuses `getAllEnrolls(region)`; the provincial
  endpoint uses `getAllEnrollsByProvince(provinceId)`. The implementation may
  consolidate the cover-enrichment logic in one place but **must preserve each
  endpoint's scope** (admin: all; evaluator: region; provincial: province).
- Cover status is not a column — it is the latest `coverLogs` row. Must not be
  denormalised onto `enrolls`/`covers`.

### Business Constraints

- Small, additive enhancement — must not break existing enroll-list consumers.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
| ---------- | --------------- | ---------- |
| Every cover has ≥1 `coverLogs` row (created with the cover) | A cover with no log would yield an undefined status | Treat missing-log as `null` coverStatus (won't match a filter) |
| One cover per enroll per fiscal year | Multiple covers would make status ambiguous | Enforced by `cover.ts create`; latest-log-wins within the one cover |

---

## Open Questions

| Question | Owner | Resolution |
| -------- | ----- | ---------- |
| Single vs multi-value filter | Human | Resolved: single value this iteration |
| Endpoint scope | Human | Resolved: admin + evaluator + provincial |
| Mechanism | Human | Resolved: query param on existing endpoints, AND-combined with existing scope filters |
| Response shape | Human | Resolved: add coverId + coverStatus |
| No-cover enrolls | Human | Resolved (annotation): include them — `none` filter value added; included in unfiltered result |
