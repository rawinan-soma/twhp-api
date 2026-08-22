---
run: run-twhp-elysia-003
work_item: past-year-write-authority
intent: fiscal-year-addressing
generated: 2026-08-22T15:40:00Z
mode: validate
---

# Implementation Walkthrough: Past-fiscal-year write authority

## Summary

A closed fiscal year is now writable, but only by ODPC — natively, or by a DOED admin, which the
system already models as a national ODPC. Every other caller is refused with a message that names
the closed year.

The work item called for new level-scoped middleware. Reading the code first showed that was
unnecessary **and impossible**: `ReviewerContext` already carries the evaluator level, and middleware
runs before the Cover is read, so it cannot know which fiscal year the target belongs to. The
delivered change is one modified source file.

## Structure Overview

Two additions to the evaluator-review helper, and one call in each of the two write entry points.

## Architecture

```
  route (evalGuard | adminGuard)          <- unchanged
        │
        ▼
  ReviewerContext { accountId, level, region }    <- already existed
        │
        ▼
  saveAnswerVerdict / finalize
        │
        ├─ assertCoverAccess(coverId, region)     <- unchanged, runs FIRST
        │
        └─ assertYearWritable(coverId, reviewer)  <- new
                 │
                 ├─ fiscalYearOfCover: covers → enrolls → getFiscalYearOf()
                 │
                 ├─ target == current  ─────► null   (unchanged for every level)
                 ├─ level === "ODPC"   ─────► null   (allowed, no expiry)
                 └─ otherwise          ─────► 403 "fiscal year N is closed"
```

## Files Changed

### Created

| File | Purpose |
|------|---------|
| `src/service/evaluator-review.pastyear.test.ts` | 12 tests across level, year, and region |

### Modified

| File | Changes |
|------|---------|
| `src/service/evaluator-review.ts` | Added `fiscalYearOfCover` and `assertYearWritable` to the helper; called the gate in `saveAnswerVerdict` and `finalize` |

**No route, middleware, schema, or migration.**

## Key Implementation Details

### 1. The year comes from the record, never the request

`fiscalYearOfCover` joins `covers → enrolls` and resolves the year from `enroll_date`. If a write
could nominate its own fiscal year, a caller could relabel which year it is editing and bypass the
gate entirely. This is a security property, not a convenience, and it is commented as such.

### 2. The gate is year-conditional, not a blanket ODPC rule

```ts
if (targetYear === utilities().getFiscalYear().fiscalYear) return null;
```

Mental and DOH evaluators do legitimate tier-1 review work in the current year. A gate written as
"ODPC only" would satisfy the requirement's wording and break the system. Two tests exist purely to
catch that, asserting both tier-1 levels are unaffected while the year is open.

### 3. Ordering is an information-disclosure decision

The year gate runs **after** `assertCoverAccess`. An out-of-region caller keeps receiving a plain
404 and never learns that a Cover exists in a particular year. In `finalize`, the existing ODPC-only
check stays first and performs no database read at all.

### 4. One rule for reads and writes

`fiscalYearOfCover` calls `utilities().getFiscalYearOf()` — the same helper every read path uses. A
closed year cannot be judged by one rule when reading and another when writing.

### 5. DOED needed no special case

`adminReviewerContext` already returns `{ level: "ODPC", region: null }`. The rule reduced to
`level === "ODPC"` with no admin-specific branch anywhere. The domain had unified these actors long
before this intent existed.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location | Service layer | Middleware cannot see the Cover, so it cannot know the target year |
| Authority test | `level === "ODPC"` | A DOED admin is already a national ODPC |
| Level resolution | Existing per-request lookup | Already shipped in `resolveEvaluator`; the JWT is untouched, so session lifetime and refresh rotation are unaffected |
| Gate condition | Only when the year is closed | Protects current-year tier-1 review |
| Ordering | After the region check | Prevents disclosure of a Cover's existence |
| Documentation | Deferred to `factory-grace-window` | The complete write rule is not settled until Factory grace lands; documenting half of it would need rewriting one item later |

## Deviations from Plan

1. **The write-path verification count was wrong.** The plan said "exactly five" no-argument
   `getFiscalYear()` calls remain. The real number is **seven** — the figure under-counted `answer.ts`
   (four calls) and omitted `cover.create`. Corrected in the plan and in run 002's walkthrough, which
   carried the same error. The verification passes; only the expected number was wrong.
2. **Two assertions were strengthened** after review. The allow cases originally asserted "not the
   refusal", which a removed gate would also satisfy. They now assert the exact downstream message.

## Dependencies Added

| Package | Why Needed |
|---------|------------|
| (none) | |

## How to Verify

1. **Full suite**
   ```bash
   bun test src
   ```
   Expected: 479 pass, 1 skip, 0 fail, 480 tests across 23 files.

2. **The gate itself**
   ```bash
   bun test src/service/evaluator-review.pastyear.test.ts
   ```
   Expected: 12 pass, 0 fail.

3. **Blast radius — one source file**
   ```bash
   git status --porcelain -- src/routes src/middleware src/drizzle
   ```
   Expected for this run: no route, middleware, or schema file among the changes.

4. **Write paths untouched**
   ```bash
   grep -rn "getFiscalYear()" src/service/ --include="*.ts" | grep -v "\.test\.ts"
   ```
   Expected: seven write-path calls plus one in `assertYearWritable`.

5. **No lint regression**
   ```bash
   bunx biome check src --max-diagnostics=100
   ```
   Expected: 3 errors, 30 warnings, 3 infos.

## Test Coverage

- Tests added: **12**
- Coverage: not measured — no target configured in this repository
- Status: **passing**, zero regressions

## Ready for Review

- [x] All acceptance criteria met
- [x] Tests passing
- [x] No critical issues
- [ ] Documentation — deliberately deferred to `factory-grace-window`, with a named owner
- [x] Developer notes captured

## Developer Notes

**Half the continuity problem is solved.** DOED and ODPC can now finish review and scoring on a
closed year, with no deadline. What remains is the Factory half: a Factory that never submitted its
answers still cannot submit them, and no evaluator can supply that input on its behalf. That is
`factory-grace-window`, and it is the part that answers the concern this intent started from.

**The work item's premise was wrong, and checking cost little.** It asserted new middleware was
required. Twenty minutes of reading showed the level was already resolved per request, a DOED admin
was already an ODPC, and the same gate pattern was already in production in `finalize`. The delivered
change is a fraction of what was planned at migration. This is the second time in this intent that
reading the code first collapsed a work item — the first was the resolver's supposed need for a
time-injection parameter.

**One process lesson, now seen twice.** A string edit silently failed because a formatter had already
reflowed the target line. The test then failed for its original reason and looked like a different
bug. The same class of failure hit `state.yaml` during planning. Read the file back and confirm an
edit landed; do not infer it from the absence of an error.

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-003*
