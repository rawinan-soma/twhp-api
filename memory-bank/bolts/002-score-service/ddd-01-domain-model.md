---
stage: model
bolt: 002-score-service
created: 2026-06-03T00:00:00Z
---

## Static Model: Score Endpoints (Route Layer)

This bolt is the presentation layer for the score feature. The domain logic lives in bolt 001 (`scoreService`). This bolt maps four actors to their corresponding endpoints, guards, and service calls.

---

### Actors (Route-Level)

| Actor | Role enum | Guard | Identity source | Scope |
|-------|-----------|-------|----------------|-------|
| **Factory** | `Factory` | `factoryGuard` | `jwtPayload.sub` → `factoryId` | Own cover |
| **Evaluator** | `Evaluator` | `evalGuard` | `evaluatorService.helper.getEvaluatorData(id)` → `region` | All covers in their health region |
| **Provincial Officer** | `Provincial` | `officerGuard` | `provincialOfficerService.getOfficerDataById(id)` → `provinceId` | All covers in their province |
| **DOED Admin** | `DOED` | `adminGuard` | `jwtPayload.sub` (not used for scoping) | All covers, optional filters |

---

### Route Map

| Method | Path | Guard | Service call | Response type |
|--------|------|-------|-------------|--------------|
| GET | `/twhp/api/factories/assessments/score` | `factoryGuard` | `scoreService.getScoreByFactory(factoryId)` | `ScoreReportSchema` (single) |
| GET | `/twhp/api/evaluators/score` | `evalGuard` | `scoreService.getScoresByRegion(region)` | `ScoreReportListSchema` |
| GET | `/twhp/api/provincialOfficers/score` | `officerGuard` | `scoreService.getScoresByProvince(provinceId)` | `ScoreReportListSchema` |
| GET | `/twhp/api/admins/score` | `adminGuard` | `scoreService.getAllScores({ region?, provinceId? })` | `ScoreReportListSchema` |

---

### Value Objects (Route-Specific)

- **AdminScoreQuery**: Optional filter object `{ region?: number; provinceId?: number }` — parsed from query string by ElysiaJS TypeBox validation.

---

### Error Propagation Model

Service methods return `ElysiaCustomStatusResponse` for errors. Route handlers check and forward them:

| Service return | Route behaviour |
|---------------|----------------|
| `status(404, …)` | Return directly (cover not found) |
| `status(400, …)` | Return directly (cover in_progress) |
| ScoreReport / ScoreReport[] | Return as 200 response |

List endpoints (`getScoresByRegion`, `getScoresByProvince`, `getAllScores`) never return error statuses — they return an empty array when no ready covers exist. No `ElysiaCustomStatusResponse` check needed for list routes.

The evaluator route also checks `getEvaluatorData` for an invalid evaluator (returns `ElysiaCustomStatusResponse`) before calling the score service.

The provincial officer route checks `getOfficerDataById` for an invalid officer similarly.

---

### File Map

| File | Autoload path | Route registered at |
|------|--------------|---------------------|
| `src/routes/factories/assessments/score/index.ts` | `/twhp/api/factories/assessments/score` | Nested under existing `assessments/` group |
| `src/routes/evaluators/score/index.ts` | `/twhp/api/evaluators/score` | New sibling under `evaluators/` |
| `src/routes/provincialOfficers/score/index.ts` | `/twhp/api/provincialOfficers/score` | New sibling under `provincialOfficers/` |
| `src/routes/admins/score/index.ts` | `/twhp/api/admins/score` | New sibling under `admins/` |

---

### Ubiquitous Language (Route Layer)

- **Guard**: Pre-composed ElysiaJS plugin that verifies the JWT cookie and enforces the role. Applied via `.use(guard)` in each route group.
- **jwtPayload**: Derived context set by `jwtPlugin`. Contains `sub` (account ID as string).
- **ScoreReport**: The typed response object consumed from `scoreService`. Defined in `src/schema/score.ts`.
- **AdminScoreQuery**: Optional query params `region` and `provinceId` for the admin endpoint.
