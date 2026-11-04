---
run: run-twhp-elysia-002
work_item: fiscal-year-read-addressing, fiscal-year-boundary-tests
intent: fiscal-year-addressing
generated: 2026-08-21T13:25:00Z
mode: confirm (batch)
---

# Implementation Walkthrough: Fiscal-year addressing across all read paths

## Summary

Before this run, the TWHP API could only ever answer questions about *now*. Every fiscal-scoped read
resolved the current fiscal year and no caller could ask for another. At 2026-10-01 that would have
meant Factories seeing `no enrollment found`, staff lists returning `meta.total: 0`, and a year of
data becoming unreachable overnight — with nothing deleted and nothing broken.

Thirteen read endpoints now accept an optional `fiscalYear`. Omitting it selects the current year, so
every existing client is unaffected. The completed capability is the trim point identified at
inception: **shipped alone, these two work items prevent the rollover blackout.**

A second outcome was not planned. `docs/business-rules.md` had rated the fiscal-year boundary
**Unknown** since it was written. That question now has an answer, and it is recorded with evidence.

## Structure Overview

Four layers, bottom-up: services take an optional year and pass it to the resolver; routes compose
the shared schema; response schemas carry the resolved year; documentation and tests state what is
now true.

## Architecture

### Layer Structure

```text
  route ──?fiscalYear──► FiscalYearQuery              src/schema/fiscal-year.ts
   (t.Numeric, multipleOf 1, 2000..2100)
                              │
                              ▼
          utilities().getFiscalYear(year?)            src/utils.ts
                              │
              { fiscalYear, fiscalYearStart, fiscalYearEnd }
                              │
                              ▼
     service predicate: gte/lt(enrolls.enroll_date)   6 services
                              │
                              ▼
              response items stamped with fiscalYear
```

## Files Changed

### Created

| File | Purpose |
|------|---------|
| `src/service/fiscal-year-routes.test.ts` | 50 tests — every fiscal-scoped endpoint composes the shared schema |
| `src/service/fiscal-year-addressing.integration.test.ts` | 19 tests — addressing and role scoping against a live database |

### Modified

| File | Changes |
|------|---------|
| 12 route files | Compose `FiscalYearQuery`; forward `query.fiscalYear` |
| `src/service/enroll.ts` | `listEnrolls`, both list wrappers, `getEnrollByFactoryId` |
| `src/service/factory.ts` | `enrollExists`, `FactoryListParams`, three list variants, `stampFiscalYear` helper |
| `src/service/score.ts` | `listScoreReports`, three role wrappers, `getScoreByFactory` |
| `src/service/cover.ts` | `getCoverById` |
| `src/service/answer.ts` | `getAnswerByFactoryId` (read path only) |
| `src/utils.ts` | Resolver returns the resolved `fiscalYear` alongside the boundaries |
| `src/schema/{enroll,factory,score}.ts` | Optional `fiscalYear` on response schemas |
| `docs/business-rules.md` | **BR-06: Unknown → Verified**, with evidence and a retained open clause |
| `docs/database.md` | "Uncertainty and risk" → "Observed behavior" + narrower "Remaining risk" |
| `docs/handover.md` | No longer claims timezone correctness is unresolved |
| `docs/testing.md` | Fiscal-year coverage located; green-suite claim corrected against the baseline |
| `docs/api-conventions.md` | New "Fiscal year" section; three stale statements corrected |
| `.specs-fire/standards/api-conventions.md` | Fiscal-year addressing added to the query contract |

## Key Implementation Details

### 1. The resolved year is the response's year

A fiscal-scoped query filters to exactly one year, so every row it returns belongs to that year by
construction. Stamping items from the resolved year needs no projection changes and — more
importantly — the year shown can never disagree with the filter that selected the row.

### 2. One exception, stated rather than smoothed over

The Factory list with `enrolled=false` disables fiscal filtering entirely, so its rows may span
years. Asserting one `fiscalYear` there would be untrue, so the field is **omitted**. This is
enforced by `stampFiscalYear`, asserted by test, and documented in two places.

### 3. Writes were deliberately left alone

Five resolver calls still take no argument: `enroll.create`, `enroll.updateEnroll`, and three
`answer` write paths. Addressing is a read capability in this intent. Out-of-year writes are the
next work item's problem.

### 4. Introspection, not HTTP, for route coverage

The nine staff routes sit behind guards that answer before query validation runs, so a
`?fiscalYear=99999` → 400 test would assert 401 against a route with no schema at all — and pass.
Reading the registered schema has no blind spot. This reasoning was already recorded in
`pagination-routes.test.ts`; it applies unchanged.

### 5. The OpenAPI document is generated, so it is a test

`@elysiajs/openapi` derives the document from route schemas. A missing parameter there means a
missing composition in the route, not a documentation oversight. Measured before and after:
13 endpoints gained `fiscalYear`; `questions` correctly gained nothing.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Response year source | Resolved window, not per row | Cannot disagree with the filter; no projection changes |
| `enrolled=false` | Omit the field | Rows may span years; any single value would be untrue |
| Resolver return shape | Add `fiscalYear` alongside the boundaries | Additive — all 14 call sites destructure only the two boundaries. Avoids a second clock read and a second derivation |
| Documentation timing | Same work item as the code | Repo precedent: bolt 028 shipped intent 012's doc corrections alongside its code |
| ADR-0012 | Not written | 11 ADRs across 12 intents sets a high bar; both decisions follow from choices already recorded in the design doc and ADR-0008 |
| Item 2 scope | Reduced to what remained | Most of its test scope was already discharged; cited rather than rewritten |

## Deviations from Plan

1. **The resolver gained a return field.** Run 001's design said "return shape unchanged"; that was
   aimed at churn at call sites, which still holds at zero. Recorded in the review report.
2. **Item 2 shrank.** Its acceptance criteria were largely met by earlier work. Rewriting equivalent
   tests would have inflated the count without adding coverage.
3. **Two composition tests added** beyond plan, to discharge the `PaginationQuery` criterion
   specifically rather than by proxy.

## Dependencies Added

| Package | Why Needed |
|---------|------------|
| (none) | |

## How to Verify

1. **Full suite**
   ```bash
   bun test src
   ```
   Expected: 467 pass, 1 skip, 0 fail, 468 tests across 22 files.

2. **Both timezones**
   ```bash
   TZ=UTC bun test src && TZ=Asia/Bangkok bun test src
   ```
   Expected: identical results; the Bangkok run additionally executes the legacy-parity test.

3. **The API document**
   ```bash
   curl -s http://localhost:81/twhp/api/document/json | \
     python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for p in d['paths'] if (g:=d['paths'][p].get('get')) and any(q['name']=='fiscalYear' for q in g.get('parameters',[]))))"
   ```
   Expected: `13`.

4. **No lint regression**
   ```bash
   bunx biome check src --max-diagnostics=100
   ```
   Expected: 3 errors, 30 warnings, 3 infos — the recorded baseline.

5. **No write path was touched**
   ```bash
   grep -rn "getFiscalYear()" src/service/ --include="*.ts" | grep -v "\.test\.ts"
   ```
   Expected: **seven** results — `cover.create`, `enroll.create`, `enroll.updateEnroll`,
   `answer.saveAnswer`, `answer.submit`, `answer.update`, `answer.negotiate`.

   *(Corrected 2026-08-22: this originally said "five". It under-counted `answer.ts`, which retains
   four write-path calls, and omitted `cover.create`. Run 003 adds an eighth call in
   `evaluator-review.assertYearWritable`, which reads the current year deliberately and is not a
   write path.)*

## Test Coverage

- Tests added: **72** across both work items (396 → 468)
- Coverage: not measured — no target is configured in this repository
- Status: **passing**, zero regressions at every step

## Ready for Review

- [x] All acceptance criteria met (one explicitly reported inconclusive)
- [x] Tests passing
- [x] No critical issues
- [x] Documentation updated
- [x] Developer notes captured

## Developer Notes

**The fiscal-year blackout is now prevented.** On 2026-10-01, every role can still reach FY2026 by
naming it. What is *not* yet possible is finishing unfinished work — that is
`past-year-write-authority` and `factory-grace-window`, and it is the half that addresses the
originally stated concern about Factories and evaluators who will not have completed FY2026.

**BR-06 has an answer.** Production PostgreSQL runs on UTC; no production code sets `enrollDate`
explicitly; the boundary is pinned to UTC+7 in code. The fiscal year has been landing exactly at
Bangkok midnight all along. That was worth one `SHOW timezone;`.

**Two limitations are unchanged and should stay visible.** BR-07 remains application-only — no unique
constraint, so `.limit(1)` owner lookups stay arbitrary where duplicates exist. And fiscal-year
identity is still derived per read rather than stored, so correctness rests on one function.

**One process lesson.** `biome format --write <dir>` is not scoped to the files a run touched. It
silently reformatted two unrelated files that had drifted, adding 51 lines of noise to the diff. They
were reverted and every changed file re-classified. Scope formatter writes to changed files.

**One check is outstanding.** The bulk-import provenance query returned zero rows locally, but the
local database holds no enrollment data, so it proves nothing. The query is recorded in
`docs/database.md` and should be run against production once.

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-002*
