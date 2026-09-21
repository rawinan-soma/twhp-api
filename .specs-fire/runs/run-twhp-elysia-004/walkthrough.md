---
run: run-twhp-elysia-004
work_item: factory-grace-window, concurrent-years-and-audit
intent: fiscal-year-addressing
generated: 2026-08-22T17:30:00Z
mode: batch (validate + confirm)
---

# Implementation Walkthrough: Factory grace window and concurrent years

## Summary

A Factory that had not finished its assessment when the fiscal year turned can now finish it, for 31
days. That closes the intent: reading a closed year was solved in runs 001–002, writing one by
DOED/ODPC in run 003, and this run adds the half only the Factory itself can perform.

The intent is complete. **6 of 6 work items, 512 tests, zero failures, no database schema change.**

## Architecture

```
  WRITE                                        │  target year        │  authority
  ───────────────────────────────────────────  │  ─────────────────  │  ─────────────────────────
  evaluator verdict / finalize                 │  read from Cover    │  ODPC only, no expiry
  factory answers / negotiate / submit         │  named or current   │  grace, 31 days
  factory cover create                         │  current only       │  —
  factory enrollment create / update           │  current only       │  —
```

Two mechanisms, deliberately opposite:

```
run 003 — the caller names a coverId        run 004 — the caller names nothing
  lookup ──► gate ──► proceed                 resolve year ──► lookup ──► proceed
  (gate refuses an existing target)           (resolution decides what the target IS)
```

## Files Changed

### Created

| File | Purpose |
|------|---------|
| `src/service/factory-grace.test.ts` | 20 tests — policy in isolation, then write-path wiring |
| `src/service/concurrent-years.integration.test.ts` | 12 tests — two open years, `coverService.create`, expiry |

### Modified

| File | Changes |
|------|---------|
| `src/utils.ts` | `GRACE_DAYS`, `factoryGraceApplies`, surfaced on `utilities()` |
| `src/service/answer.ts` | `resolveWritableYear` plus `fiscalYear` on the four completion paths |
| `src/routes/factories/assessments/index.ts` | `FiscalYearQuery` on the four write endpoints |
| `docs/api-conventions.md` | Write authority, grace window, expiry |
| `docs/business-rules.md` | BR-06a, BR-06b; a note on what BR-07 did **not** gain |
| `docs/handover.md` | Write rule in the critical-rules list |
| `.specs-fire/standards/api-conventions.md` | Mirrors the rule and its limitation |

## Key Implementation Details

### 1. Grace widens selection; it does not gate

The Factory write paths take no `coverId` — they *find* the Cover using the year window. There was
nothing to gate, so the year had to be resolved **before** the lookup. This inverts run 003, and the
reason is structural rather than stylistic, so it is recorded in the code.

### 2. The window is a rule, not a date range

```ts
const graceEnds = fiscalYearBoundary(currentYear - 1).getTime() + GRACE_DAYS * 86_400_000;
```

Three tests assert it in FY2030 and FY2024. A hard-coded 2026 range would pass every 2026 assertion
and fail those — which is exactly the failure that would otherwise surface years later, in
production, silently.

### 3. The exclusions are the scope

`POST /assessments/covers` and both `/factories/enrolls` write paths expose no `fiscalYear` at all.
Grace is bounded **by construction** rather than by a check that could be forgotten. The generated
OpenAPI document is the proof, and its absences carry as much meaning as its presences.

### 4. The two-open-years condition could not previously exist

Every `.limit(1)` self-read in the codebase was written assuming a Factory holds at most one live
enrollment. Grace breaks that. All four self-reads are therefore asserted under the condition rather
than reasoned about — and all four resolve the intended year.

### 5. Expiry does nothing, on purpose

A Cover unfinished at window close stays `in_progress` permanently. No sweep, no job, no marker, no
invented status. Verified by an invariant log count paired with a positive status assertion, because
asserting absence alone is weak.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mechanism | Widen selection | The window is the selector; a gate was structurally impossible |
| Year source | Explicit parameter, default current | `.limit(1)` over a widened window would pick arbitrarily between two open years |
| Why safe | `factoryId` from the JWT | Selects among the caller's own Covers; grants nothing |
| Policy location | `src/utils.ts` | `src/schema/fiscal-year.ts` would have been circular — anticipated at the plan checkpoint |
| `saveAnswer` guard | **Not added** | Unreachable: `submit` requires all questions answered, `saveAnswer` refuses when one exists |
| Attribution | Log-level only, limitation recorded | `CoverLogs.evaluator_id` is an evaluator reference; a schema change was out of scope |

## Deviations from Plan

1. **The policy moved to `src/utils.ts`.** Flagged as provisional at the plan checkpoint and
   confirmed circular during execution, so this was a planned branch rather than a surprise.
2. **`customProps` was not changed.** The plan proposed adding actor attribution to request logs.
   The logger is registered above the auth guards, so it cannot reliably see the subject. Shipping it
   would have produced `undefined` and *looked* like attribution. Reported as not delivered instead.

## How to Verify

1. **Full suite** — `bun test src` → 511 pass, 1 skip, 0 fail, 512 tests, 25 files
2. **Both timezones** — `TZ=UTC bun test src && TZ=Asia/Bangkok bun test src`
3. **One policy declaration** — `grep -rn "GRACE_DAYS =" src/` → exactly one
4. **Scope by absence** —
   ```bash
   curl -s http://localhost:81/twhp/api/document/json | python3 -c "import json,sys; d=json.load(sys.stdin); p=d['paths']; print([m for m,o in p['/twhp/api/factories/assessments/covers'].items() if m=='post'], [q['name'] for q in (p['/twhp/api/factories/assessments/covers']['post'].get('parameters') or [])])"
   ```
   Expected: no `fiscalYear` on cover creation or on either enrollment write.
5. **No schema change** — `git status --porcelain -- src/drizzle` → empty

## Test Coverage

- Tests added this run: **32** (20 grace, 12 concurrent years)
- Intent total: **357 → 512**, zero regressions at any step
- Coverage: not measured — no target configured in this repository

## Ready for Review

- [x] All acceptance criteria met, except one reported as **not delivered** with reasons
- [x] Tests passing
- [x] No critical issues
- [x] Documentation complete across four files
- [x] Developer notes captured

## Developer Notes

**The intent is done, and the original concern is answered.** On 2026-10-01 nothing goes dark; a
Factory that missed the deadline has 31 days to finish; DOED and ODPC can close out reviews with no
deadline at all. None of it required a schema change.

**One criterion was not delivered, and is reported as such.** Grace-window Factory writes are not
attributable in the database. `CoverLogs.evaluator_id` is an evaluator reference and a Factory is not
an evaluator; the alternative — attribution in request logs — is blocked by plugin ordering. Both
routes are named in BR-06a. Reinterpreting the criterion into something achievable would have been
easy and dishonest.

**Two limitations survive the intent untouched, and should stay visible.** BR-07 has no unique
constraint, so `.limit(1)` owner lookups remain arbitrary where duplicates exist — a Factory holding
two open years is now handled, but that is year-disambiguation, not cardinality enforcement. And
fiscal-year identity is still derived per read rather than stored, so correctness rests on one
function in `src/utils.ts`.

**Reading the code first collapsed three work items in this intent** — the resolver's supposed need
for a time-injection parameter, the write gate's supposed need for new middleware, and `saveAnswer`'s
supposed missing guard. In each case the plan assumed work that was already done or unnecessary. The
pattern is worth carrying into the next intent.

**One process failure recurred three times**: a content-matched edit silently no-opping after a
formatter had reflowed the target line. Anchor on position, and read the file back.

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-004*
