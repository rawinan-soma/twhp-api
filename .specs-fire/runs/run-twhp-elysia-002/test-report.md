---
run: run-twhp-elysia-002
work_item: fiscal-year-read-addressing
intent: fiscal-year-addressing
generated: 2026-08-21T13:10:00Z
status: passed
---

# Test Report: run-twhp-elysia-002 (batch)

## Work Item: fiscal-year-read-addressing

### Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Route composition (`fiscal-year-routes.test.ts`) | 50 | 0 | 0 |
| Addressing integration (`fiscal-year-addressing.integration.test.ts`) | 13 | 0 | 0 |
| Resolver echo (added to `utils.fiscal-year.test.ts`) | 3 | 0 | 0 |
| **New this work item** | **66** | **0** | — |
| Carried from run 001 + pre-existing | 396 | 0 | 1 |
| **Total** | **462** | **0** | 1 |

```
bun test src                  ->  461 pass · 1 skip · 0 fail · 462 tests · 22 files
TZ=Asia/Bangkok bun test src  ->  462 pass · 0 skip · 0 fail · 462 tests · 22 files
```

Baseline `.specs-fire/baseline-2026-08-21.md` was 357/0 across 18 files; run 001 took it to 396/0
across 20. **Zero regressions at every step.**

### Acceptance Criteria Validation

- ✅ **`fiscalYear` accepted on all 9 staff list endpoints** — asserted per endpoint by schema
  introspection, and confirmed in the live OpenAPI document.
- ✅ **`fiscalYear` accepted on all 4 Factory self-reads** — these had **no** query parameters at all
  before this work, so each is asserted individually rather than sampled.
- ✅ **Omitting the parameter returns what it returned before** — 396 pre-existing tests still pass
  untouched; every call site that omits `fiscalYear` exercises the unchanged default path.
- ✅ **Count and page share one predicate** — `meta.total` agreement asserted under an addressed year.
- ✅ **Role scoping unchanged for an addressed year** — province scoping asserted directly; Factory
  self-reads remain keyed on the JWT subject, never on a query value.
- ✅ **A valid year with no data returns an empty page, not 404** — asserted with `fiscalYear=2005`:
  `items: []`, `total: 0`, `totalPages: 0`.
- ✅ **Prior-year rows are invisible without the parameter and visible with it** — the core claim of
  the intent, asserted against a live database with fixtures in two fiscal years.
- ✅ **Different rows per year, not one row relabelled** — asserted by comparing row ids.
- ✅ **Responses carry the Common Era `fiscalYear`** — asserted on self-reads and on every list item.
- ✅ **The `enrolled=false` exception omits the field** — asserted that no item carries `fiscalYear`
  when fiscal filtering is disabled.
- ✅ **`GET /questions` does not gain the parameter** — asserted, and confirmed in OpenAPI.
- ✅ **The shared schema is composed, not copied** — structural identity asserted against
  `FiscalYearQuery.properties.fiscalYear` for all 13 endpoints. A hand-rolled duplicate with the same
  bounds would pass the behavioural checks but fail this one.
- ✅ **`PaginationQuery` survives composition** — `page` and `limit` still registered on all nine.
- ✅ **No write path touched** — `enroll.create`, `enroll.updateEnroll`, and the three `answer` write
  paths still call `getFiscalYear()` with no argument.

### OpenAPI Verification

Measured against the live document at `/twhp/api/document`, using the pre-work state recorded in
`plan.md` as the baseline:

```
endpoints exposing fiscalYear: 13     (was 0)
factories/assessments/questions: []   (unchanged — correctly excluded)
```

The generated parameter carries `required: false`, `minimum: 2000`, `maximum: 2100`,
`multipleOf: 1`, and the description naming Common Era, omitted-means-current, and the `+543`
client-side Buddhist Era conversion. **This closes the acceptance criterion deferred by run 001.**

### Tests Written

- `src/service/fiscal-year-routes.test.ts` — 50 tests. Schema introspection per endpoint, not HTTP
  requests: the nine staff routes sit behind guards that answer before query validation runs, so a
  `?fiscalYear=99999` → 400 test would assert 401 against a route with no schema at all and pass.
- `src/service/fiscal-year-addressing.integration.test.ts` — 13 tests against a live database.
  Fixtures span two fiscal years and are built with `utilities().getFiscalYear(year)` rather than
  host-local `new Date(y, 9, 1)`, so this file does not inherit the timezone fragility of
  `factory-pagination.integration.test.ts:159-160`.
- 3 tests appended to `src/utils.fiscal-year.test.ts` for the resolver's new `fiscalYear` echo.

### Lint

```
before:  3 errors · 30 warnings · 3 infos   (baseline)
after:   3 errors · 30 warnings · 3 infos
```

**Zero findings introduced.** Reaching that required two corrections during the run — see Issues.

### Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| 10 `assist/source/organizeImports` errors introduced — the new import was inserted after `schema/pagination` rather than in alphabetical order | Medium | **Fixed** — `biome check --write` applied per file |
| **Two unrelated files were reformatted by accident** (`src/schema/authentication.ts`, `src/service/score.test.ts`). A broad `biome format --write src/schema src/service` reflowed pre-existing files that had drifted from the formatter | Medium | **Reverted** via `git checkout`. Every remaining changed file was then classified intended/unintended and verified |
| Route path matching in the introspection test assumed Elysia stores `"covers"` verbatim; it normalises leading slashes | Low | **Fixed** — matcher normalises, and reports the available routes on failure |
| A direct `bun -e` probe of a route module hung and had to be killed — importing a route boots Redis and MinIO connections that keep the process alive | Low | Avoided; introspection inside `bun test` exits cleanly |

The reformatting issue is the one worth remembering: `biome format --write <dir>` is not scoped to
the files a run touched, and silently enlarges a diff. Scope it to changed files.

### Caveats Carried Forward

- `factory-pagination.integration.test.ts:159-160` still builds host-local dates. Untouched here;
  belongs to `fiscal-year-boundary-tests`.
- BR-06 documentation is not yet corrected — next work item in this run.
- `docs/adr/0008:56` records an unresolved item from intent `012` about the left/inner join
  asymmetry under `enrolled=false`. This work modified that code and deliberately did **not** resolve
  it; doing so would change what `enrolled=false` selects.

### Ready for Completion

- [x] All tests passing (462, zero failures)
- [ ] Coverage target met — no target configured; not measured
- [x] All acceptance criteria validated
- [x] No critical issues open
- [x] Zero regressions
- [x] Zero Biome findings introduced
- [x] Documentation updated in the same item

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-002*

---

## Work Item: fiscal-year-boundary-tests

### Test Results

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Role scoping added to `fiscal-year-addressing.integration.test.ts` | 6 | 0 | 0 |
| **New this work item** | **6** | **0** | — |
| **Total suite** | **467** | **0** | 1 |

```
bun test src                  ->  467 pass · 1 skip · 0 fail · 468 tests · 22 files
TZ=UTC bun test src           ->  467 pass · 1 skip · 0 fail
TZ=Asia/Bangkok bun test src  ->  468 pass · 0 skip · 0 fail
```

The two-timezone runs are recorded here as **evidence**, which was the point of this criterion —
every fiscal-year assertion is an absolute UTC instant, so the results are identical. The single
skip is the Bangkok-only legacy-parity test, which runs under `TZ=Asia/Bangkok`.

### Acceptance Criteria Validation

- ✅ **Boundary at Sep 30 23:59:59.999 / Oct 1 00:00:00.000 Bangkok** — discharged by run 001;
  cited, not rewritten.
- ✅ **Leap year** — discharged by run 001 (366 vs 365 day spans).
- ✅ **Suite passes identically under both timezones** — recorded above.
- ✅ **Per-role scoping on addressed reads** — Provincial was covered in item 1; this item added
  **Evaluator** (sees its region, and does **not** see another region), **DOED** (national), a
  negative Provincial case, and the Factory cross-access refusal.
- ✅ **A Factory cannot address another Factory's year** — asserted across current, prior, and empty
  years. `factoryId` comes from the JWT subject, so no query value can select a different owner.
- ✅ **An addressed year narrows and never widens a result set** — asserted directly.
- ✅ **`meta.total` agrees with the page** — discharged in item 1.
- ✅ **Parity when `fiscalYear` is omitted** — 396 pre-existing tests pass untouched.
- ✅ **BR-06 updated from Unknown to Verified** — with the evidence recorded, not just the verdict.
- ✅ **`docs/database.md` and `docs/handover.md` corrected.**
- ✅ **`docs/testing.md` updated** — the fiscal-year row now names where the coverage lives, and the
  "not necessarily green" caveat is corrected against the recorded baseline.
- ⚠️ **Bulk-import provenance check — INCONCLUSIVE, see below.**

### Bulk-Import Provenance Check — inconclusive

Run against the local development database on 2026-08-21:

```
total Enrolls rows                   : 0
rows within 24h of an Oct 1 boundary : 0
newest enroll_date                   : (none)
```

**This proves nothing about production.** The local database holds no enrollment data, so a zero
result here is the absence of data, not the absence of risk. Reported as inconclusive rather than as
a pass.

The check is recorded in `docs/database.md` under "Remaining risk" so it can be run against a
production connection. An empty result there would mean no existing row sits close enough to an
Oct 1 boundary to be reclassified by the derivation.

### Lint

```
before:  3 errors · 30 warnings · 3 infos
after:   3 errors · 30 warnings · 3 infos
```

Zero introduced.

### Guards Held

Two things this item was explicitly forbidden from changing were verified afterwards:

- **BR-07 did not drift.** Its confidence line still reads *"Application rule Verified; durable
  cardinality absent."* No unique constraint was added, so nothing about it improved.
- **BR-06 records only half a resolution.** The boundary interpretation is Verified; the entry
  retains a **Still open** clause stating that fiscal-year identity is derived per read rather than
  stored, and that CSV-imported rows fall outside the verified chain.

### Ready for Completion

- [x] All tests passing (468, zero failures)
- [ ] Coverage target met — no target configured; not measured
- [x] Acceptance criteria validated (11 met, 1 explicitly inconclusive)
- [x] No critical issues open
- [x] Zero regressions
- [x] Zero Biome findings introduced
- [x] Documentation corrected in four files

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-002*
