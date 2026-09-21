---
run: run-twhp-elysia-004
work_item: factory-grace-window
intent: fiscal-year-addressing
mode: validate
checkpoint: plan
approved_at: null
---

# Implementation Plan: 31-day Factory grace window

Based on `factory-grace-window-design.md` (Checkpoint 1 approved 2026-08-22).

## Approach

Four steps, bottom-up:

1. **Declare the policy once** — `GRACE_DAYS` and `factoryGraceApplies(targetYear, now?)`, expressed
   relative to the rollover boundary and consuming the fiscal-year resolver.
2. **Resolve the target year in the four write services** — `saveAnswer`, `update`, `submit`,
   `negotiate` take an optional `fiscalYear`, default current, and refuse a non-current year unless
   grace admits it.
3. **Forward it from the four write routes** as a query parameter, reusing `FiscalYearQuery`.
4. **Test the window, the paths, and the refusals**, including the `saveAnswer` invariant.

## Endpoint Map

Confirmed against `src/routes/factories/assessments/index.ts`:

| Line | Endpoint | Service | In grace scope |
|------|----------|---------|----------------|
| 117 | `POST /answers` | `answerService.saveAnswer` | **yes** |
| 189 | `PATCH /answers` | `answerService.update` | **yes** |
| 243 | `POST /answers/negotiate` | `answerService.negotiate` | **yes** |
| 279 | `POST /submission` | `answerService.submit` | **yes** |
| 45 | `POST covers` | `coverService.create` | **no** — starts a new assessment |

`enroll.create` and `enroll.updateEnroll` are likewise out of scope and stay current-year only.

## Files to Modify

| File | Changes |
|------|---------|
| `src/schema/fiscal-year.ts` | Add `GRACE_DAYS` and `factoryGraceApplies` beside the existing bounds — the module already owns fiscal-year policy and is dependency-light |
| `src/service/answer.ts` | `fiscalYear` parameter and grace check on `saveAnswer`, `update`, `submit`, `negotiate` |
| `src/routes/factories/assessments/index.ts` | Compose `FiscalYearQuery` on the four write endpoints and forward `query.fiscalYear` |

## Files to Create

| File | Purpose |
|------|---------|
| `src/service/factory-grace.test.ts` | Window boundaries, recurrence in a later fiscal year, per-path coverage, refusals, and the `saveAnswer` invariant |

**No schema change. No scheduled job. No persisted flag.**

## Technical Details

### The policy

```ts
/** Days after the rollover boundary during which a Factory may still finish the prior year. */
export const GRACE_DAYS = 31;

/**
 * Whether Factory grace admits a write to `targetYear` at `now`.
 *
 * Expressed relative to the rollover boundary, so it means "31 days after rollover" in every fiscal
 * year — not only 2026. Consumes the resolver; performs no local date arithmetic.
 */
export const factoryGraceApplies = (targetYear: number, now = new Date()) => {
  const currentYear = utilities().getFiscalYearOf(now);
  if (targetYear !== currentYear - 1) return false;   // only the immediately preceding year
  const { fiscalYearStart } = utilities().getFiscalYear(currentYear);
  return now.getTime() < fiscalYearStart.getTime() + GRACE_DAYS * 86_400_000;
};
```

**Placement note.** `src/schema/fiscal-year.ts` already owns `FISCAL_YEAR_MIN`/`MAX` and is imported
by `src/utils.ts`. Putting the policy there keeps one fiscal-year policy module and avoids a circular
import, since `factoryGraceApplies` needs `utilities()`. **If that import direction proves circular
in practice, the policy moves to `src/utils.ts` instead** — one declaration either way, which is the
criterion that matters.

### The write-path check

```ts
const resolveWritableYear = (fiscalYear?: number) => {
  const currentYear = utilities().getFiscalYearOf(new Date());
  const targetYear = fiscalYear ?? currentYear;

  if (targetYear !== currentYear && !factoryGraceApplies(targetYear)) {
    return status(403, { message: `fiscal year ${targetYear} is closed to factories` });
  }
  return targetYear;
};
```

Applied identically in all four services, then the existing Cover lookup uses
`utilities().getFiscalYear(targetYear)` instead of the no-argument call.

The grace decision happens **before** the Cover lookup, because it determines which window the lookup
uses. This is the reverse of `assertYearWritable` in run 003, and deliberately so: there the target
already existed; here the decision determines what the target is.

### Routes

```ts
query: FiscalYearQuery,   // the four write endpoints; multipart bodies are untouched
```

A query parameter rather than a body field, so the multipart answer schemas stay unchanged and the
write side matches the read side's contract.

## Tests

| Coverage | Assertion |
|----------|-----------|
| Window opens | Grace applies at 2026-10-01 00:00:00.000 Bangkok |
| Window closes | Applies at 2026-10-31 23:59:59.999; does **not** at 2026-11-01 00:00:00.000 |
| Recurrence | The window still means "31 days after rollover" in a later fiscal year, not literal 2026 dates |
| Preceding year only | FY2025 is not admitted during October 2026 |
| Current year untouched | All four paths behave exactly as today when no year is named |
| Grace completion | A Factory may save, update, negotiate, and submit on a prior-year Cover in the window |
| After expiry | The same writes are refused with the closed-year message |
| Enrollment immutable | `enroll.create` and `enroll.updateEnroll` refuse a prior year, in and out of the window |
| `saveAnswer` invariant | A submitted Cover has every question answered, so `saveAnswer` refuses on it — **stated as an invariant, not enforced by a new guard** |

Baseline to hold: **480 tests, 0 failures**; Biome at 3 errors / 30 warnings / 3 infos.

## Verification Beyond Tests

- `git status` must show three modified source files and one new test file for this item.
- No file under `src/drizzle/` may appear.
- `grep` for `GRACE_DAYS` must return exactly one declaration.

## Out of Scope

- `coverService.create`, `enroll.create`, `enroll.updateEnroll`
- Any scheduled job, sweep, or persisted expiry marker
- Documentation — deferred with `past-year-write-authority` and written once the complete write rule
  exists, which is at the end of this run
- Auditing and the `.limit(1)` sweep → `concurrent-years-and-audit`, the second item in this run

---
*Plan approved at checkpoint. Execution follows.*

---

## Work Item: concurrent-years-and-audit

### Situation

Scope has shifted since migration. `factory-grace-window` introduced the `fiscalYear` parameter that
makes two open years resolvable, so this item now **verifies** that behaviour rather than introducing
it. It is also the first moment the two-open-years condition can actually be constructed — grace
created it.

What is already discharged:

| Criterion | Status |
|-----------|--------|
| Self-reads default to the current year; a named year reaches the other | ✅ run 002 integration tests |
| Scoring excludes `in_progress` | ✅ pre-existing — `SCORABLE_STATUSES` is `in_review`/`finished`; **no change needed** |
| A `finished` Cover is never reopened | ✅ pre-existing status guards |
| Out-of-year writes are refused distinguishably | ✅ run 003 (evaluator) and run 004 item 1 (Factory), each with its own message |

What genuinely remains: the two-open-years verification, the audit trail, the expiry disposition, and
the documentation deferred twice on purpose.

### A constraint that changes one criterion

The work item asks that grace-window writes "record the acting Factory and that grace authorised
them". **This cannot be done in the database without a schema change**, which is forbidden:

- A Factory submit writes `coverLogs` as `{ coverId, status: "in_review" }` — `evaluatorId` is left
  null (`src/service/answer.ts:374`).
- `coverLogs.evaluatorId` is semantically an *evaluator*. A Factory is not one. Writing a factory id
  there would corrupt every query that reads the column as an evaluator reference.
- Adding a column is out of scope for the entire intent.

The work item anticipated this: *"if it cannot, attribution for those belongs in the request log
rather than in a new column."* This plan therefore delivers **log-level attribution** and records the
database-level limitation explicitly, rather than quietly reporting the criterion as met.

Today `customProps()` returns `{}` (`src/index.ts:40-42`), so no actor appears on any request log.

### Approach

1. **Two-open-years tests** — construct the condition that grace now makes possible and verify every
   `.limit(1)` self-read resolves the intended year.
2. **Audit** — attribute out-of-year writes in the request log, at the route layer where the
   authenticated subject is available.
3. **Expiry** — assert that nothing happens: no transition, no `coverLogs` row, no job.
4. **Documentation** — write the complete write rule once, now that all of it exists.

### Files to Modify

| File | Changes |
|------|---------|
| `src/index.ts` | `customProps()` returns the authenticated subject and role, so every request log carries an actor |
| `docs/api-conventions.md` | The complete fiscal-year write rule: current-year default, DOED/ODPC past-year authority, the 31-day Factory grace window, and what each refusal means |
| `docs/business-rules.md` | A new rule for out-of-year write authority; note against BR-06/BR-07 on what this intent did and did not resolve |
| `docs/handover.md` | The write rule in the critical-rules list |
| `.specs-fire/standards/api-conventions.md` | Mirror the write rule alongside the read contract |

### Files to Create

| File | Purpose |
|------|---------|
| `src/service/concurrent-years.integration.test.ts` | Two open years across every self-read; `coverService.create`; expiry disposition |

### Tests

| Coverage | Assertion |
|----------|-----------|
| Two open years — reads | With a grace-window FY2026 Cover **and** a FY2027 enrollment, each self-read without a year returns FY2027, and with `fiscalYear=2026` returns FY2026 |
| Every `.limit(1)` site | `enroll.ts:518`, `cover.ts:50`, `answer.ts` reads, `score.ts:177` — each asserted under the two-year condition |
| `coverService.create` | Succeeds for the new year alongside an unfinished prior Cover. **Proven by test, not assumed** from reading the `enroll_id` duplicate check |
| New-year enrollment during grace | Succeeds, unaffected by the prior year's unfinished state |
| Expiry | A Cover `in_progress` at window close undergoes no transition and generates no `coverLogs` row. Asserted by row count before and after the boundary |
| Scoring | An `in_progress` Cover remains non-scorable — asserting the pre-existing behaviour, changing nothing |
| Audit | An out-of-year refusal is logged distinguishably from a 404 |

Baseline to hold: **500 tests, 0 failures**; Biome at 3 / 30 / 3.

### Out of Scope

- Any Cover status, flag column, or persisted expiry marker
- Any scheduled job or sweep
- Database-level attribution of Factory writes — **not achievable without a schema change**; recorded
  as a limitation in `docs/business-rules.md`
- `docs/adr/0008:56`, still unresolved and not this intent's to close

---
*Plan approved at checkpoint. Execution follows.*
