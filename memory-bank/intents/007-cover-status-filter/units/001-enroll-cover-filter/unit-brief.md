---
unit: 001-enroll-cover-filter
intent: 007-cover-status-filter
phase: inception
status: complete
created: 2026-06-24T06:09:51.000Z
updated: 2026-06-24T06:09:51.000Z
---

# Unit Brief: Enroll Cover Filter

## Purpose

Let the three staff enroll-list endpoints filter enrolls by their assessment
cover's status and return each enroll enriched with `coverId` + `coverStatus`,
without changing auth, schema tables, or existing list behaviour when the new
filter is absent.

## Scope

### In Scope

- Cover-status derivation per enroll (latest `coverLogs` row; no-cover → null).
- Optional `coverStatus` query filter (`finished | in_progress | in_review | none`),
  AND-combined with each endpoint's existing scope + fiscal year.
- Response enrichment with `coverId` + `coverStatus` (shared schema).
- The three routes: `admins/enrolls`, `evaluators/enrolls`, `provincialOfficers/enrolls`.

### Out of Scope

- Factory enroll endpoint (`getEnrollByFactoryId`).
- New region/provinceId params on the admin enroll endpoint.
- Multi-value / comma-separated status filtering.
- Any write to covers/coverLogs/enrolls.

---

## Assigned Requirements

| FR   | Requirement | Priority |
| ---- | ----------- | -------- |
| FR-1 | `coverStatus` query param on the 3 staff enroll lists, AND-combined with scope | Must |
| FR-2 | Status derivation (latest-log-wins) + no-cover (`none`/null) handling | Must |
| FR-3 | Response enrichment with `coverId` + `coverStatus` (shared schema) | Must |
| FR-4 | Backward compatibility (additive, ordering preserved) | Must |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
| ------ | ----------- | ---------- |
| Enroll | Factory's fiscal-year enrollment | id, factoryId, enrollDate, … |
| Cover | The assessment cover for an enroll (≤1 per enroll/FY) | id, enrollId |
| CoverLog | Status history of a cover (latest wins) | id, coverId, status |

### Key Operations

| Operation | Description | Inputs | Outputs |
| --------- | ----------- | ------ | ------- |
| getAllEnrolls | List enrolls (admin: all; evaluator: by region) + cover enrichment + optional filter | region?, provinceId?, coverStatus? | enroll[] with coverId/coverStatus |
| getAllEnrollsByProvince | Province-scoped list + cover enrichment + optional filter | provinceId, coverStatus? | enroll[] with coverId/coverStatus |

---

## Story Summary

| Metric        | Count |
| ------------- | ----- |
| Total Stories | 3     |
| Must Have     | 3     |
| Should Have   | 0     |
| Could Have    | 0     |

### Stories

| Story ID | Title | Priority | Status |
| -------- | ----- | -------- | ------ |
| 001-cover-status-derivation-and-filter | Service enrichment + coverStatus filter | Must | Planned |
| 002-enroll-cover-response-schema | Shared response schema (coverId + coverStatus) | Must | Planned |
| 003-enroll-routes-coverstatus-param | `coverStatus` query param on 3 routes | Must | Planned |

---

## Dependencies

### Depends On

| Unit | Reason |
| ---- | ------ |
| — | none |

### Depended By

| Unit | Reason |
| ---- | ------ |
| — | none |

### External Dependencies

| System | Purpose | Risk |
| ------ | ------- | ---- |
| PostgreSQL | covers/coverLogs read | Low |

---

## Technical Context

### Suggested Technology

- Drizzle ORM; reuse the latest-log-wins idiom from `score.ts`:
  `selectDistinctOn([coverLogs.coverId], {...}).orderBy(coverLogs.coverId, desc(coverLogs.id))`.
- TypeBox enum for `coverStatus` query param (optional union incl. `none`).
- Bun `bun test` integration tests against the test DB (pattern in
  `evaluator-review.verdict.integration.test.ts`).

### Integration Points

| Integration | Type | Protocol |
| ----------- | ---- | -------- |
| enroll routes → enrollService | function call | in-process |
| enrollService → PostgreSQL | DB | SQL (Drizzle) |

### Data Storage

| Data | Type | Volume | Retention |
| ---- | ---- | ------ | --------- |
| covers/coverLogs | SQL (read) | bounded by FY enroll set | n/a |

---

## Constraints

- No N+1: ≤ 2 extra bounded queries for enrichment.
- Must not denormalise cover status onto enrolls/covers.
- Preserve `desc(enrolls.enrollDate)` ordering.

---

## Success Criteria

### Functional

- [ ] `coverStatus=finished|in_progress|in_review|none` filters correctly on all 3 endpoints.
- [ ] Each enroll carries `coverId` + `coverStatus` (null when no cover).
- [ ] Filter is AND-combined with scope; no out-of-scope leakage.
- [ ] Invalid `coverStatus` → 400; absent → behaviour-preserving.

### Non-Functional

- [ ] No N+1 (≤ 2 enrichment queries).
- [ ] No change to existing fields/ordering.

### Quality

- [ ] Integration tests cover each status, `none`, no-filter, invalid value, scope composition.
- [ ] All acceptance criteria met.

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
| ---- | ---- | ------- | --------- |
| 018-enroll-cover-filter | DDD | 001, 002, 003 | Cover-status enrichment + filter across the 3 enroll endpoints |

---

## Notes

- The evaluator endpoint already calls `getAllEnrolls(region)` (not
  `getAllEnrollsByRegion`); the provincial endpoint calls
  `getAllEnrollsByProvince(provinceId)`. Implementation may centralise the
  cover-enrichment logic but MUST preserve each endpoint's scope.
- `getAllEnrollsByRegion` exists but is unused by the current evaluator route —
  decide during design whether to also extend it or leave it untouched.
