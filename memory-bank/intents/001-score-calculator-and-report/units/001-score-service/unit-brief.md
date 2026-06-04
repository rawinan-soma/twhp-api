---
unit: 001-score-service
intent: 001-score-calculator-and-report
phase: inception
status: complete
created: 2026-06-03T00:00:00.000Z
updated: 2026-06-03T00:00:00.000Z
---

# Unit Brief: Score Service

## Purpose

Implement on-demand score calculation from a Cover's Answers and expose it via four role-scoped read-only endpoints. This is the sole unit for the score feature — no schema changes required.

## Scope

### In Scope

- Score formula: `round(sum(points) / (3 × non_na_count) × 100)` with `n/a` exclusion
- Per-category breakdown across 5 QuestionCategories
- Cover status guard (reject `in_progress`)
- `createScoreService(db)` factory + singleton following existing pattern
- 4 GET route files: `factories/assessments/score`, `evaluators/score`, `provincialOfficers/score`, `admins/score`
- TypeBox response schemas in `src/schema/`

### Out of Scope

- Persisting scores to DB
- Any write operations
- Email or background job integration
- Historical score tracking

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Score calculation formula (choice→points, n/a exclusion) | Must |
| FR-2 | Per-category score breakdown (5 categories) | Must |
| FR-3 | Reject in_progress covers with 400 | Must |
| FR-4 | Factory GET endpoint — own score | Must |
| FR-5 | Evaluator GET endpoint — region list | Must |
| FR-6 | Provincial Officer GET endpoint — province list | Must |
| FR-7 | Admin GET endpoint — all + optional filters | Must |
| FR-8 | Score Report shape (8 fields + 6 score fields) | Must |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| **Score Report** | Computed result for one Cover | factoryId, factoryNameTh, coverId, coverStatus, enrollId, totalScore, collaborate, disease, safety, mental, outcome |
| **Cover** | Assessment instance per enrollment per fiscal year | id, enrollId, status (derived from latest CoverLog) |
| **Answer** | Factory's response to one Question | coverId, questionId, selectedChoice |
| **Question** | Assessment item with category | id, category (Collaborate/Disease/Safety/Mental/Outcome) |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `calculateScore` | Compute overall + per-category score from answers | coverId, answers with questions | Score Report fields |
| `getScoreByFactory` | Score for own cover (factory role) | factoryId (JWT) | Single Score Report |
| `getScoresByRegion` | Scores for all covers in a region | region (from evaluator profile) | Score Report[] |
| `getScoresByProvince` | Scores for all covers in a province | provinceId (from officer profile) | Score Report[] |
| `getAllScores` | Scores for all covers, optional filter | region?, provinceId? | Score Report[] |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 8 |
| Must Have | 8 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-score-formula | Implement score calculation formula | Must | Planned |
| 002-category-breakdown | Per-category score breakdown | Must | Planned |
| 003-cover-status-guard | Reject in_progress covers | Must | Planned |
| 004-factory-endpoint | Factory score endpoint | Must | Planned |
| 005-evaluator-endpoint | Evaluator score list endpoint | Must | Planned |
| 006-provincial-endpoint | Provincial officer score list endpoint | Must | Planned |
| 007-admin-endpoint | Admin score list endpoint with filters | Must | Planned |
| 008-score-report-shape | Score report TypeBox schema | Must | Planned |

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Authentication/JWT middleware | All endpoints require `jwtPlugin` + role guards |
| Enrolls (existing) | Fiscal year scoping via `getFiscalYear()` |
| Covers (existing) | Cover status from `coverLogs` |
| Answers + Questions (existing) | Source data for score calculation |

### Depended By

None — this is a terminal read-only unit.

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| PostgreSQL | Query answers, questions, covers, enrolls, factories, provinces | Low |

---

## Technical Context

### Suggested Technology

- Bun + ElysiaJS (existing stack)
- Drizzle ORM — aggregate query with JOIN across answers, questions, covers, enrolls, factories, provinces
- `utilities().getFiscalYear()` for fiscal year scoping
- `adminGuard`, `factoryGuard`, `evalGuard`, `officerGuard` from `src/middleware/guards.ts`

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `src/drizzle/schema.ts` | DB schema import | Drizzle ORM |
| `src/middleware/guards.ts` | Route guards | ElysiaJS plugin |
| `src/utils.ts` | getFiscalYear() | Function import |

### Data Storage

No new storage — reads from existing Answers, Questions, Covers, CoverLogs, Enrolls, Factories, Provinces tables.

---

## Constraints

- No DB schema changes
- Score must be calculated on-demand (not cached/stored)
- All endpoints are GET only
- Current fiscal year only (use `getFiscalYear()`)
- `special` field on Questions has no effect on scoring

---

## Success Criteria

### Functional

- [ ] Score formula returns correct rounded integer for any combination of choices
- [ ] `n/a` answers excluded from both numerator and denominator
- [ ] All 5 category scores present in every response
- [ ] `in_progress` cover returns 400
- [ ] Each role endpoint returns only data within its access scope

### Non-Functional

- [ ] p95 response time < 300ms
- [ ] All endpoints require valid JWT cookie

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 001-score-service | ddd-construction-bolt | 001, 002, 003, 008 | Core score service: formula, categories, guard, schema |
| 002-score-service | ddd-construction-bolt | 004, 005, 006, 007 | Route layer: 4 role-scoped endpoints |
