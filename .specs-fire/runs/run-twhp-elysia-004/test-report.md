---
run: run-twhp-elysia-004
work_item: factory-grace-window
intent: fiscal-year-addressing
generated: 2026-08-22T17:00:00Z
status: passed
---

# Test Report: run-twhp-elysia-004 (batch)

## Work Item: factory-grace-window

### Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Policy in isolation (`factory-grace.test.ts`) | 12 | 0 | 0 |
| Write-path wiring (same file) | 8 | 0 | 0 |
| **New this work item** | **20** | **0** | — |
| Carried from runs 001–003 | 480 | 0 | 1 |
| **Total** | **500** | **0** | 1 |

```
bun test src                  ->  499 pass · 1 skip · 0 fail · 500 tests · 24 files
TZ=UTC bun test src           ->  499 pass · 1 skip · 0 fail
TZ=Asia/Bangkok bun test src  ->  500 pass · 0 skip · 0 fail
```

Baseline chain: 357 → 396 → 468 → 480 → 500. **Zero regressions at every step.**

### Acceptance Criteria Validation

- ✅ **One declared policy, no competing literal** — `grep "GRACE_DAYS ="` over `src/` returns
  exactly one result, in `src/utils.ts`.
- ✅ **The policy consumes the resolver, not local date arithmetic** — `factoryGraceApplies` calls
  `getFiscalYearOf` and `fiscalYearBoundary`; it constructs no dates of its own.
- ✅ **Grace applies at 2026-10-31 23:59:59.999 Bangkok, not at 2026-11-01 00:00:00.000** — asserted
  at both instants, and again as `start + GRACE_DAYS` exactly.
- ✅ **Only the immediately preceding year** — FY2025 and FY2024 refused during October 2026, both in
  the policy and through the service wiring.
- ✅ **Grace is not consulted for the current year** — `factoryGraceApplies(2027)` is false in
  FY2027, and a write naming no year never reaches the policy.
- ✅ **A Factory may save, update, negotiate, and submit during the window** — all four paths admit
  the preceding year and proceed to the Cover lookup.
- ✅ **Prior-year enrollment writes stay refused** — `POST` and `PATCH /factories/enrolls` expose no
  `fiscalYear` in the generated OpenAPI document, so no year can be named on them at all.
- ✅ **A `finished` Cover is never reopened; an `in_review` Cover is not Factory-writable** —
  enforced by the pre-existing `in_progress` requirement on `submit` and `negotiate`, and the answer
  status check on `update`. Cited, not rebuilt.
- ✅ **Writes are refused after the window** — the closed-year message on all four paths.
- ✅ **No scheduled job, sweep, or persisted flag** — the policy is a pure function evaluated at
  write time.
- ✅ **No database schema change** — nothing under `src/drizzle/` touched.

### The window's recurrence

Three tests exist specifically to catch a hard-coded 2026: grace applies in FY2030 on the same
schedule, closes on the same schedule there, and applied in FY2024 likewise. A literal date range
would pass every 2026 assertion and fail these.

### OpenAPI — the absences are the proof

```
POST   /assessments/answers            ['fiscalYear']   grace
PATCH  /assessments/answers            ['fiscalYear']   grace
POST   /assessments/answers/negotiate  ['fiscalYear']   grace
POST   /assessments/submission         ['fiscalYear']   grace

POST   /assessments/covers             []               starts a new assessment — excluded
POST   /factories/enrolls              []               enrollment immutable — excluded
PATCH  /factories/enrolls              []               enrollment immutable — excluded
```

The four exclusions are what demonstrate grace is scoped to Cover completion. A parameter appearing
on any of them would mean the scope had leaked.

### The `saveAnswer` invariant

The design originally flagged `saveAnswer` as an unguarded path that grace would expose.
Investigation showed otherwise, and **no guard was added**:

- `saveAnswer` refuses when an answer already exists (`"existed answer"`), so it can only ever
  *create*, never modify.
- `submit` refuses unless every question is answered.

A Cover therefore reaches `in_review` only when every question already has an answer, so
`saveAnswer` always refuses on a submitted Cover — including a prior-year one reachable through
grace. The protection is **indirect**: it depends on `submit`'s completeness rule. That dependency is
recorded in the design so a future relaxation of submission does not silently open the path.

### Wiring tests need no fixtures — deliberately

The grace check runs **before** the Cover lookup, because it determines which window the lookup uses.
That makes the refusal observable with no database rows at all, and one test asserts exactly this:
a refused call must **not** return `"cover not found"`, which is what it would return if the check
had been placed after the lookup.

### Lint

```
before:  3 errors · 30 warnings · 3 infos
after:   3 errors · 30 warnings · 3 infos
```

Zero introduced.

### Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| **A source edit silently did not apply — third occurrence in this intent.** An import insertion matched on content that Biome had already alphabetized (`GRACE_DAYS, factoryGraceApplies` → `factoryGraceApplies, GRACE_DAYS`), so the write was a no-op and the test failed with `ReferenceError` | Medium | **Fixed** — reinserted by line position rather than content match, and verified by reading the file back. Prior occurrences: `state.yaml` during planning, and the teardown fix in run 003 |
| The policy could not live in `src/schema/fiscal-year.ts` as planned | Low | **Anticipated at the plan checkpoint and confirmed here.** `src/utils.ts` already imports from that module, so the reverse direction is circular. Policy placed in `src/utils.ts`; still exactly one declaration, which was the criterion |

The recurring edit failure is now a pattern rather than an accident: **after a formatter has touched a
file, content-matched edits are unreliable. Anchor on position, and read the file back.**

### Ready for Completion

- [x] All tests passing (500, zero failures)
- [ ] Coverage target met — no target configured; not measured
- [x] All acceptance criteria validated
- [x] No critical issues open
- [x] Zero regressions
- [x] Zero Biome findings introduced
- [x] Exactly one policy declaration

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-004*

---

## Work Item: concurrent-years-and-audit

### Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Two open years + create + expiry (`concurrent-years.integration.test.ts`) | 12 | 0 | 0 |
| **New this work item** | **12** | **0** | — |
| **Total suite** | **511** | **0** | 1 |

```
bun test src                  ->  511 pass · 1 skip · 0 fail · 512 tests · 25 files
TZ=Asia/Bangkok bun test src  ->  512 pass · 0 skip · 0 fail
```

Final baseline chain: 357 → 396 → 468 → 480 → 500 → 512. **Zero regressions at any step.**

### Acceptance Criteria Validation

- ✅ **Self-reads default to the current year under two open years** — asserted individually for
  enroll, cover, answers, and score. This condition **could not be constructed before**
  `factory-grace-window`; every `.limit(1)` self-read had been written assuming a Factory holds at
  most one live enrollment.
- ✅ **A named year reaches the other record** — and the two resolve to different Cover ids, so it is
  genuinely a different row rather than one relabelled.
- ✅ **`coverService.create` succeeds for the new year alongside an unfinished prior Cover** —
  **proven by test**, as the work item demanded, not inferred from reading the `enroll_id` duplicate
  check. The prior Cover is confirmed untouched, and a second Cover on the same enrollment is still
  refused.
- ✅ **New-year enrollment during grace is unaffected** by the prior year's unfinished state.
- ✅ **Expiry mutates nothing** — the `CoverLogs` row count for an untouched Cover is invariant, and
  its latest status remains `in_progress`.
- ✅ **No terminal status invented** — `coverStatus` still has three values.
- ✅ **Scoring unchanged** — an `in_progress` Cover remains non-scorable via the pre-existing
  `SCORABLE_STATUSES`; nothing was added to achieve it.
- ✅ **No scheduled job, sweep, or persisted flag.**
- ✅ **Refusals are distinguishable** — three distinct messages across the authority paths
  (`fiscal year N is closed to factories`, `fiscal year N is closed; only ODPC may write to it`,
  `cover not found`), all surfaced through the existing 4xx logging flow.
- ✅ **Documentation reflects what the intent did and did not resolve** — four files updated.
- ❌ **Per-actor attribution of grace-window writes — NOT DELIVERED.** See below.

### Not delivered: database attribution of Factory writes

The work item asks that grace-window writes "record the acting Factory and that grace authorised
them". **This is not achievable within the intent's constraints, and is reported as not met rather
than reinterpreted into something that was.**

- A Factory submit writes `coverLogs` as `{ coverId, status }` with `evaluator_id` left null
  (`src/service/answer.ts:374`).
- `CoverLogs.evaluator_id` is semantically an *evaluator* reference. A Factory is not an evaluator;
  writing a factory id there would corrupt every query that reads the column as one.
- Adding a column is out of scope for the entire intent.

A log-level alternative was considered and **not** shipped. The `@bogeychan/elysia-logger` plugin is
registered at `src/index.ts:27`, above the route groups that apply the auth guards, so `customProps`
cannot reliably see the authenticated subject. Shipping a `customProps` that silently returns
`undefined` would have looked like attribution without being it.

What *does* hold: every refusal carries a distinct message and is logged through the existing 4xx
flow, so a permission failure is separable from a missing record. What does **not**: identifying
which Factory performed a given grace-window write from stored data.

Recorded in `docs/business-rules.md` under BR-06a as a named limitation requiring a schema change.

### Lint

```
before:  3 errors · 30 warnings · 3 infos
after:   3 errors · 30 warnings · 3 infos
```

### Ready for Completion

- [x] All tests passing (512, zero failures)
- [ ] Coverage target met — no target configured; not measured
- [x] Acceptance criteria validated (10 met, 1 explicitly **not delivered** with reasons)
- [x] No critical issues open
- [x] Zero regressions
- [x] Zero Biome findings introduced
- [x] Documentation complete across four files

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-004*
