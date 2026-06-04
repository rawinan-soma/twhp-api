---
stage: design
bolt: 002-score-service
created: 2026-06-03T00:00:00Z
---

## Technical Design: Score Endpoints

### Architecture Pattern

Thin presentation layer following the existing ElysiaJS autoload pattern. Each route file exports `(app: App) => app.group(...)`. No new architectural patterns — mirrors `src/routes/evaluators/enrolls/index.ts` and `src/routes/provincialOfficers/enrolls/index.ts` exactly.

---

### Files to Create

| File | Path registered by autoload |
|------|---------------------------|
| `src/routes/factories/assessments/score/index.ts` | `GET /twhp/api/factories/assessments/score` |
| `src/routes/evaluators/score/index.ts` | `GET /twhp/api/evaluators/score` |
| `src/routes/provincialOfficers/score/index.ts` | `GET /twhp/api/provincialOfficers/score` |
| `src/routes/admins/score/index.ts` | `GET /twhp/api/admins/score` |

Zero changes to existing files.

---

### Route Designs

#### 1. Factory — `src/routes/factories/assessments/score/index.ts`

```typescript
export default (app: App) =>
  app.group("", { detail: { tags: ["factories"] } }, (group) =>
    group.use(factoryGuard).get(
      "",
      async ({ jwtPayload }) => {
        const factoryId = Number(jwtPayload.sub);
        return await scoreService.getScoreByFactory(factoryId);
      },
      {
        detail: { description: "ดูคะแนนประเมินตนเองของโรงงาน" },
        response: {
          200: ScoreReportSchema,
          400: t.Object({ message: t.String() }),  // cover in_progress
          404: t.Object({ message: t.String() }),  // cover not found
        },
      },
    ),
  );
```

**Error handling**: `getScoreByFactory` returns `ElysiaCustomStatusResponse` for 400/404. ElysiaJS forwards these directly — no manual check needed at route level since Elysia handles `ElysiaCustomStatusResponse` returns automatically.

#### 2. Evaluator — `src/routes/evaluators/score/index.ts`

```typescript
export default (app: App) =>
  app.group("", { detail: { tags: ["evaluators"] } }, (group) =>
    group.use(evalGuard).get(
      "",
      async ({ jwtPayload }) => {
        const evaluatorData = await evaluatorService.helper.getEvaluatorData(
          Number(jwtPayload.sub)
        );
        if (evaluatorData instanceof ElysiaCustomStatusResponse) return evaluatorData;
        return await scoreService.getScoresByRegion(evaluatorData.evaluator!.region);
      },
      {
        detail: { description: "ดูคะแนนประเมินโรงงานทั้งหมดในเขตสุขภาพ" },
        response: {
          200: ScoreReportListSchema,
          404: t.Object({ message: t.String() }),  // invalid evaluator
        },
      },
    ),
  );
```

**Pattern note**: identical to `src/routes/evaluators/enrolls/index.ts` — same guard + same profile lookup.

#### 3. Provincial Officer — `src/routes/provincialOfficers/score/index.ts`

```typescript
export default (app: App) =>
  app.group("", { detail: { tags: ["provincialOfficers"] } }, (group) =>
    group.use(officerGuard).get(
      "",
      async ({ jwtPayload }) => {
        const po = await provincialOfficerService.getOfficerDataById(
          Number(jwtPayload.sub)
        );
        if (po instanceof ElysiaCustomStatusResponse)
          return status(404, { message: "provincial officer not found" });
        return await scoreService.getScoresByProvince(po.provinceId);
      },
      {
        detail: { description: "ดูคะแนนประเมินโรงงานทั้งหมดในจังหวัด" },
        response: {
          200: ScoreReportListSchema,
          404: t.Object({ message: t.String() }),
        },
      },
    ),
  );
```

**Pattern note**: identical to `src/routes/provincialOfficers/enrolls/index.ts`.

#### 4. Admin — `src/routes/admins/score/index.ts`

```typescript
export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group.use(adminGuard).get(
      "",
      async ({ query }) => {
        return await scoreService.getAllScores({
          region: query.region,
          provinceId: query.provinceId,
        });
      },
      {
        detail: { description: "ดูคะแนนประเมินโรงงานทั้งหมด" },
        query: t.Object({
          region:     t.Optional(t.Number()),
          provinceId: t.Optional(t.Number()),
        }),
        response: {
          200: ScoreReportListSchema,
        },
      },
    ),
  );
```

**Query param handling**: ElysiaJS TypeBox `t.Optional(t.Number())` coerces query string values to numbers. If absent, the key is `undefined` — matches the `filters?: { region?, provinceId? }` service signature.

---

### Security Design

| Concern | Approach |
|---------|---------|
| Authentication | `jwtPlugin` applied globally — all routes inherit JWT verification |
| Authorization | Pre-composed guards: `factoryGuard`, `evalGuard`, `officerGuard`, `adminGuard` |
| Scope enforcement | Each route passes only the identity-derived scope to the service — no caller-supplied factory/region override |
| Read-only | All routes are GET — no mutation risk |

---

### NFR Implementation

| Requirement | Approach |
|-------------|---------|
| p95 < 300ms | Delegated to service layer (batch queries in bolt 001) |
| OpenAPI docs | Each endpoint has Thai `description` + typed `response` schema — auto-documented at `/twhp/api/document` |

---

### Integration Points

| Import | From | Used by |
|--------|------|---------|
| `scoreService` | `../../../service/score` | All 4 routes |
| `ScoreReportSchema`, `ScoreReportListSchema` | `../../../schema/score` | All 4 routes |
| `evaluatorService` | `../../../service/evaluator` | Evaluator route |
| `provincialOfficerService` | `../../../service/provincialOfficer` | Provincial route |
| `factoryGuard`, `evalGuard`, `officerGuard`, `adminGuard` | `../../../middleware/guards` | All 4 routes |
| `ElysiaCustomStatusResponse`, `status`, `t` | `elysia` | All 4 routes |
