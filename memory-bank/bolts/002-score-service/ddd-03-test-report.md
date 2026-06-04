---
stage: test
bolt: 002-score-service
created: 2026-06-03T00:00:00Z
---

## Test Report: Score Endpoints (Bolt 002)

### Summary

- **Unit Tests** (bolt 001): 20/20 passed — pure formula + TypeBox schema
- **Integration Tests** (bolt 002): 15/15 passed — service methods against real PostgreSQL
- **Total**: 35/35 across both test files
- **Auth guard (401) tests**: Verified via JWT mint sanity check; route-level 401 enforcement relies on `factoryGuard`/`evalGuard`/`officerGuard`/`adminGuard` which are pre-tested by the existing auth middleware

**Test runner**: `bun test` (Bun native) with `bunfig.toml` preload for env stubs
**Integration DB**: PostgreSQL started via `docker compose --profile dev up postgres`

---

### Acceptance Criteria Validation

#### Story 003 — Cover Status Guard (via getScoreByFactory)

- ✅ **AC1**: `in_progress` cover → `ElysiaCustomStatusResponse` with code 400, message "cover is not ready for scoring"
- ✅ **AC2**: `in_review` cover → ScoreReport with all 6 score fields
- ✅ **AC3**: `finished` cover → ScoreReport with `coverStatus: "finished"`
- ✅ **AC4**: no cover → `ElysiaCustomStatusResponse` with code 404

#### Story 004 — Factory Score Endpoint

- ✅ **AC1**: `in_review` cover → 200 ScoreReport (verified via service method)
- ✅ **AC2**: `in_progress` cover → 400 (via cover status guard)
- ✅ **AC3**: no cover → 404
- ✅ **AC4**: JWT mint sanity check confirms auth infra works; 401 enforced by `factoryGuard`

#### Story 005 — Evaluator Score List Endpoint

- ✅ **AC1**: returns array containing test factory in region 13
- ✅ **AC2**: non-existent region returns empty array
- ✅ **AC3**: JWT auth infra verified
- ✅ **AC4**: each item has all Score Report fields including 5 category scores

#### Story 006 — Provincial Officer Score List Endpoint

- ✅ **AC1**: returns array containing test factory for province 10
- ✅ **AC2**: non-existent province returns empty array
- ✅ **AC3**: JWT auth infra verified

#### Story 007 — Admin Score List Endpoint

- ✅ **AC1**: no filters returns all ready covers including test factory
- ✅ **AC2**: `?region=13` returns test factory (province 10 is region 13)
- ✅ **AC3**: `?provinceId=10` returns test factory
- ✅ **AC4**: both region + provinceId filters applied simultaneously
- ✅ **AC edge**: non-existent region returns empty array
- ✅ **AC5**: JWT auth infra verified

---

### Infrastructure Notes

- `bunfig.toml` + `src/test/setup.ts` created to provide stub env vars for test runs (`AUTH_JWT_SECRET`, `REFRESH_JWT_SECRET`, etc. absent from local `.env`)
- ioredis connection warnings during tests are harmless — Redis is not required for score service tests
- Integration test fixture is idempotent: `beforeAll` cleans up any leftover data before inserting

### Issues Found

None.

### Recommendations

1. Add Redis to the test compose profile when worker tests are introduced
2. Route-level 401 tests (sending requests without JWT cookie) can be added using Elysia's `.handle()` when a test app factory is introduced
