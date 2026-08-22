---
run: run-twhp-elysia-002
work_item: fiscal-year-read-addressing
intent: fiscal-year-addressing
mode: confirm
checkpoint: plan
approved_at: null
---

# Implementation Plan: Fiscal-year addressing across all read paths

## Approach

Four layers, bottom-up, so each is verifiable before the next depends on it:

1. **Services accept an optional `fiscalYear`** and pass it to `utilities().getFiscalYear(fiscalYear)`.
   Every one of these functions already calls the resolver with no argument; the change is to thread
   a value through, never to construct a window locally.
2. **Routes compose `FiscalYearQuery`** into their existing query schema with `t.Composite`, exactly
   as `PaginationQuery` is composed today, and forward `query.fiscalYear` to the service.
3. **Response schemas gain `fiscalYear`** (Common Era).
4. **Documentation is corrected in the same item**, not deferred — three sections of
   `docs/api-conventions.md` go stale the moment this merges.
5. **Tests** prove parity when the parameter is omitted, and correct scoping when it is supplied.

13 endpoints total: 9 staff lists, 4 factory self-reads.

## Files to Modify

### Services (6)

| File | Changes |
|------|---------|
| `src/service/enroll.ts` | `listEnrolls`, `getAllEnrolls`, `getAllEnrollsByProvince`, `getEnrollByFactoryId` accept `fiscalYear?` |
| `src/service/factory.ts` | `enrollExists(database, withFiscalYear, fiscalYear?)`; `FactoryListParams` gains `fiscalYear?`; all three list variants thread it |
| `src/service/score.ts` | `listScoreReports` and its three role wrappers; `getScoreByFactory` |
| `src/service/cover.ts` | `getCoverById` |
| `src/service/answer.ts` | `getAnswerByFactoryId` (read path only — write paths untouched) |
| `src/schema/enroll.ts`, `src/schema/factory.ts`, `src/schema/score.ts` | Add `fiscalYear` to the affected response schemas |

### Documentation (2)

Added at Checkpoint after review. Intent `012` shipped its `docs/api-conventions.md` corrections in
the same bolt as the code (bolt 028: *"Documentation is a deliverable of this intent, not an
afterthought"*). Deferring them here would mean merging code that contradicts its own documentation.

| File | Changes |
|------|---------|
| `docs/api-conventions.md` | **:275** — state that a fiscal year can now be nominated, not only computed. **:173** — the claim *"fiscal-year scoping … unchanged"* becomes false and must be corrected. **:200** — add the `enrolled=false` / `fiscalYear` interaction, which is the "documented" behaviour this plan relies on and which currently has no home. **New section** — `fiscalYear` parameter, parallel to the existing Pagination section (129-157) |
| `.specs-fire/standards/api-conventions.md` | Currently contains **zero** mentions of "fiscal". Add the parameter to the query-contract section alongside `page`/`limit` |

### OpenAPI document

The OpenAPI document at `/twhp/api/document` is **generated**, not authored — `@elysiajs/openapi`
derives it from the route schemas (`src/index.ts:25`). Adding `FiscalYearQuery` to a route therefore
surfaces `fiscalYear` automatically, including the `description` already carried by the schema.

There is nothing to write, but there **is** something to verify. Bolt 028 of intent `012` treated
this as an explicit deliverable ("Verified OpenAPI `query` and `200` schemas on all nine routes"),
and this item inherits the acceptance criterion that run 001 deferred: *"OpenAPI describes
`fiscalYear` as Common Era, omitted-means-current."*

**Measured current state** (live document, 44 paths):

| Endpoint | query params today | after this item |
|----------|--------------------|-----------------|
| `admins/enrolls`, `evaluators/enrolls`, `provincialOfficers/enrolls` | `coverStatus, page, limit` | `+ fiscalYear` |
| `admins/factories`, `evaluators/factories`, `provincialOfficers/factories` | `validated, enrolled, page, limit` | `+ fiscalYear` |
| `admins/score` | `region, provinceId, page, limit` | `+ fiscalYear` |
| `evaluators/score`, `provincialOfficers/score` | `page, limit` | `+ fiscalYear` |
| `factories/enrolls` | *(none)* | `fiscalYear` |
| `factories/assessments/covers` | *(none)* | `fiscalYear` |
| `factories/assessments/answers` | *(none)* | `fiscalYear` |
| `factories/assessments/score` | *(none)* | `fiscalYear` |
| `factories/assessments/questions` | *(none)* | **stays empty** — not fiscal-scoped |

The four Factory self-reads currently declare **no query parameters at all**, so `fiscalYear` will be
the first on each. That makes them the most likely place for a missed composition to go unnoticed,
and the reason the verification is per-endpoint rather than a spot check.

**Note, not in scope**: the document's `info` block is still the framework default — title "Elysia
Documentation", description "Development documentation", version "0.0.0". Worth configuring at some
point; unrelated to this item.

### Routes (12 files, 13 endpoints)

| File | Endpoint |
|------|----------|
| `src/routes/admins/factories/index.ts` | `GET` factory list |
| `src/routes/admins/enrolls/index.ts` | `GET` enrollment list |
| `src/routes/admins/score/index.ts` | `GET` score report list |
| `src/routes/evaluators/factories/index.ts` | `GET` (region-scoped) |
| `src/routes/evaluators/enrolls/index.ts` | `GET` (region-scoped) |
| `src/routes/evaluators/score/index.ts` | `GET` (region-scoped) |
| `src/routes/provincialOfficers/factories/index.ts` | `GET` (province-scoped) |
| `src/routes/provincialOfficers/enrolls/index.ts` | `GET` (province-scoped) |
| `src/routes/provincialOfficers/score/index.ts` | `GET` (province-scoped) |
| `src/routes/factories/enrolls/index.ts` | `GET` own enrollment (line 43) |
| `src/routes/factories/assessments/index.ts` | `GET covers` (line 18), `GET /answers` (line 75) |
| `src/routes/factories/assessments/score/index.ts` | `GET` own score |

`GET /questions` (`assessments/index.ts:65`) is **not** fiscal-scoped and is not touched. No write
endpoint is touched.

## Files to Create

| File | Purpose |
|------|---------|
| `src/service/fiscal-year-addressing.integration.test.ts` | Scoping and parity across the addressed read paths |
| `src/service/fiscal-year-routes.test.ts` | Route-level: every fiscal-scoped route composes `FiscalYearQuery` |

## Technical Details

### Threading pattern

```ts
// before
const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

// after
const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(fiscalYear);
```

`fiscalYear` is `number | undefined`; undefined means the current year, which is what the resolver
already does. **No service constructs a window locally** — that is a project rule and the whole point
of run 001.

### Route pattern

```ts
query: t.Composite([
  t.Object({ coverStatus: CoverStatusQuery }),
  PaginationQuery,
  FiscalYearQuery,          // <- added
]),
```

Composition, never replacement, so existing filters keep their declarations and their OpenAPI
documentation. Proven safe in run 001: `limit > LIMIT_MAX` is still rejected under composition.

### Route-level introspection test

Following `src/service/pagination-routes.test.ts` and its recorded reasoning: an HTTP request for
`?fiscalYear=99999` expecting 400 is the wrong test here, because all nine staff routes sit behind
`adminGuard` / `evalGuard` / `officerGuard` and an unauthenticated request is answered by the guard
**before** query validation runs. Such a test would pass against a route with no fiscal-year schema
at all. Reading the registered schema has no blind spot.

### Deciding what `fiscalYear` means in a response

**Recommendation: derive it from the resolved window, not per row.**

A fiscal-scoped query filters to exactly one year, so every row it returns belongs to that year by
construction. Populating the field from the resolved year is therefore correct, needs no projection
changes, and cannot disagree with the filter that selected the row.

Deriving per row via `getFiscalYearOf(enroll_date)` would also work for enrollment lists —
`enrollListColumns` spreads `getTableColumns(enrolls)`, so `enrollDate` is already projected — but the
score and factory list projections do not carry it, and adding it purely to re-derive a value we
already know would be redundant work with a chance of disagreeing at a boundary.

**One exception, which must be handled explicitly.** The factory list with `enrolled=false` disables
the fiscal-year predicate entirely (`enrollExists(database, withFiscalYear=false)`), so its rows may
span years. Asserting a single `fiscalYear` there would be a lie. On that path the field is
**omitted**, and the behaviour is documented rather than quietly rationalised.

### Known traps (from the work item)

- **Do not revert the factory list `EXISTS` to a join.** The join multiplied rows and corrupted
  `meta.total`; see `docs/adr/0008-exists-subquery-for-enrolled-filter.md`. Threading a window is
  exactly the edit that tempts a revert.
- **`enrolled=false` keeps its current semantics.** Intent 012 deliberately left them alone; so does
  this. Its interaction with `fiscalYear` is documented, not changed.
- **Count and page queries must share one predicate**, including the resolved window, or `meta.total`
  and the page disagree.
- **`factoryId` continues to come from the JWT subject** on every self-read. Threading a query
  parameter must not create any path where an identifier is read from user input.

## Tests

| Test File | Coverage |
|-----------|----------|
| `src/service/fiscal-year-addressing.integration.test.ts` | Rows from a prior year are invisible without the parameter and visible with it; role scoping holds for an addressed year across Factory, Provincial, Evaluator, DOED; `meta.total` agrees with the page under `fiscalYear` combined with each existing filter; a valid year with no data returns an empty page at 200, never 404 |
| `src/service/fiscal-year-routes.test.ts` | All 13 fiscal-scoped endpoints register `fiscalYear` in their query schema; `PaginationQuery` bounds survive composition; `GET /questions` does **not** gain it |
| OpenAPI verification | Each of the 13 endpoints exposes `fiscalYear` as a query parameter in the generated document, described as Common Era with omitted-means-current; `factories/assessments/questions` still exposes none. Verified against the live document at `/twhp/api/document`, using the measured before-state above as the baseline |
| Parity | Every touched endpoint, called without `fiscalYear`, returns what it returns today |

Prose documentation is verified by review: no statement in `docs/api-conventions.md` may contradict
the shipped behaviour when this item closes. The OpenAPI document is verified mechanically, per the
table above — it is generated, so a missing parameter there means a missing composition in the route,
not a documentation oversight.

Baseline to beat: **396 tests, 0 failures** (`.specs-fire/baseline-2026-08-21.md` plus run 001).
Biome must stay at 3 errors / 30 warnings / 3 infos.

## Decisions Recorded Here, Not as an ADR

Two design choices are recorded in this plan and the walkthrough rather than as a new ADR:

1. `fiscalYear` in responses derives from the **resolved window**, not per row.
2. The field is **omitted** on the factory-list `enrolled=false` path, where rows may span years.

Rationale for not writing ADR-0012: this repository has 11 ADRs across 12 intents, so the bar is a
genuine architectural choice. Both of these are implementation consequences of decisions already
recorded — the canonical fiscal-year definition (`fiscal-year-resolver-design.md`) and the
`enrolled=false` semantics (ADR-0008). **Reversible if you disagree**; an ADR is cheap to add.

## Pre-Existing Open Item Encountered

`docs/adr/0008:56` records an unresolved item from intent `012`:

> *"The left/inner join asymmetry must be resolved explicitly. It is currently an accident of three
> separately written queries. Construction must decide and document what the region and province
> variants do for a factory with no enrollment when `enrolled=false`."*

This plan modifies `enrollExists` and all three factory list variants — exactly that code. It does
**not** resolve the asymmetry, because doing so would change what `enrolled=false` selects, which is
a larger semantic change than this item authorises. Flagged so it is not walked past silently, and so
the next person does not mistake this work for having addressed it.

## Out of Scope for This Item

- BR-06 documentation corrections (`docs/business-rules.md`, `docs/database.md:372`,
  `docs/handover.md:58`) — the next item in this run, `fiscal-year-boundary-tests`, which is where
  the evidence for that change lives
- Boundary, leap-year, and timezone coverage — same, next item
- Any write path, grace window, or authority check — `past-year-write-authority` onward
- The pre-existing timezone fragility at `factory-pagination.integration.test.ts:159-160`

---
*Plan approved at checkpoint. Execution follows.*

---

## Work Item: fiscal-year-boundary-tests

### Situation

Much of this item's stated test scope is **already discharged** by earlier work in this intent. That
is not padding to remove — it is coverage that genuinely exists and should be cited, not rewritten:

| Acceptance criterion | Status |
|----------------------|--------|
| Boundary at Sep 30 23:59:59.999 / Oct 1 00:00:00.000 Bangkok | ✅ `utils.fiscal-year.test.ts` (run 001) |
| Leap year — 366 vs 365 day spans | ✅ same |
| Timezone independence of the resolver | ✅ same, plus full suite run under both TZs |
| `meta.total` agrees with the page under an addressed year | ✅ `fiscal-year-addressing.integration.test.ts` (item 1) |
| Valid year with no data → empty page, not 404 | ✅ same |
| Province scoping preserved for an addressed year | ✅ same |
| Parity when `fiscalYear` is omitted | ✅ implicitly — 396 pre-existing tests pass untouched |

**What genuinely remains** is therefore narrower, and mostly documentation:

1. Role scoping for the roles item 1 did **not** cover: Evaluator (region), DOED (national), and a
   Factory attempting to reach another Factory's year.
2. The full suite recorded under `TZ=UTC` as well as `TZ=Asia/Bangkok`, as evidence rather than
   assertion.
3. The bulk-import provenance check.
4. Documentation corrections — the largest remaining piece, and the reason this item exists at all
   now that BR-06 has an answer.

### Approach

1. **Add the missing scoping assertions** to `fiscal-year-addressing.integration.test.ts` rather than
   creating a second file. They belong with the fixtures that already exist there.
2. **Run the provenance query** against the database and record the result verbatim.
3. **Correct the documentation**, which is where this item now carries most of its value.
4. **Record the two-timezone suite runs** in the test report.

### Files to Modify

| File | Changes |
|------|---------|
| `src/service/fiscal-year-addressing.integration.test.ts` | Evaluator region scoping, DOED national scoping, and Factory cross-access refusal for an addressed year |
| `docs/business-rules.md` | **BR-06: Unknown → Verified.** Record the evidence: production PostgreSQL is `TimeZone = UTC`; `enrollDate` is always the `CURRENT_TIMESTAMP` default (no production code sets it); the boundary is pinned to UTC+7 in code, so it lands at Bangkok midnight on 1 October. Also remove the "two separate `new Date()` calls" rollover-race note — that race no longer exists |
| `docs/database.md` (≈:372) | Currently states the boundary interpretation is unresolved. Correct it, and record that the resolver no longer inherits the host timezone |
| `docs/handover.md` (:58) | *"timezone correctness at deployment remains unresolved"* — no longer true |
| `docs/testing.md` | Line 118 lists fiscal-year boundary behaviour as a testing concern. Record where that coverage now lives. Also correct the statement that the suite is not necessarily green — it is, and the baseline records it |

### What must NOT change

- **BR-07 stays application-only.** No unique constraint was added; duplicate enrollments within a
  year remain possible and `.limit(1)` stays arbitrary in that case. Its confidence rating must not
  drift upward on this item's coat-tails.
- **The storage half of BR-06 stays open.** Fiscal-year identity is still re-derived per read rather
  than stored. What is now Verified is the *boundary interpretation*, not the absence of derivation.
  State the evidence, not just the verdict.
- `docs/adr/0008:56` remains unresolved and is not this item's to close.

### Tests

| Coverage | Where |
|----------|-------|
| Evaluator region scoping on an addressed year | `fiscal-year-addressing.integration.test.ts` |
| DOED national scoping on an addressed year | same |
| Factory cannot address another Factory's year | same |
| Full suite under `TZ=UTC` and `TZ=Asia/Bangkok` | recorded in the test report as evidence |
| Bulk-import provenance | query result recorded verbatim in the test report |

Baseline to hold: **462 tests, 0 failures**; Biome at 3 errors / 30 warnings / 3 infos.

### Out of Scope

- Fixing `factory-pagination.integration.test.ts:159-160`, which builds host-local dates. It is
  pre-existing, and repairing it means editing a test this intent does not otherwise touch.
- Any write path, grace window, or authority check.
- Configuring the OpenAPI `info` block, still at framework defaults.

---
*Plan approved at checkpoint. Execution follows.*
