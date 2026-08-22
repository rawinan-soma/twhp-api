---
run: run-twhp-elysia-003
work_item: past-year-write-authority
intent: fiscal-year-addressing
mode: validate
checkpoint: plan
approved_at: null
---

# Implementation Plan: Past-fiscal-year write authority for DOED and ODPC

## Approach

Three steps. The design established that no middleware is needed, so this is contained entirely
within one service file.

1. **Add `fiscalYearOfCover(coverId)`** to `createEvaluatorReviewHelper`, beside `assertCoverInRegion`
   and `assertCoverExists`. It resolves a Cover's fiscal year from its Enrollment.
2. **Add `assertYearWritable(coverId, reviewer)`**, which returns a refusal only when the target year
   is closed *and* the reviewer is not ODPC.
3. **Call it from the two write entry points**, `saveAnswerVerdict` and `finalize`, each time
   immediately after `assertCoverAccess`.

## Files to Modify

| File | Changes |
|------|---------|
| `src/service/evaluator-review.ts` | Add `fiscalYearOfCover` and `assertYearWritable` to the helper; call the gate in `saveAnswerVerdict` and `finalize` |

## Files to Create

| File | Purpose |
|------|---------|
| `src/service/evaluator-review.pastyear.test.ts` | Gate coverage across level, year, and region |

**No route file, no middleware, no schema, no migration.**

## Technical Details

### The helper

`assertCoverInRegion` already joins `covers → enrolls`, so the shape is established:

```ts
/** The Common Era fiscal year a Cover belongs to, via its Enrollment. Null when the Cover is absent. */
const fiscalYearOfCover = async (coverId: number) => {
  const row = await database
    .select({ enrollDate: enrolls.enrollDate })
    .from(covers)
    .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
    .where(eq(covers.id, coverId))
    .limit(1)
    .then((r) => r[0]);

  return row ? utilities().getFiscalYearOf(new Date(row.enrollDate)) : null;
};
```

The fiscal-year rule is **not** re-derived here. It calls `getFiscalYearOf`, the same helper every
read path uses, so a closed year cannot be judged by one rule for reads and another for writes.

### The gate

```ts
const assertYearWritable = async (coverId: number, reviewer: ReviewerContext) => {
  const targetYear = await fiscalYearOfCover(coverId);
  if (targetYear === null) return status(404, { message: "cover not found" });

  // Unchanged for every level while the year is open. A blanket ODPC-only rule here would strip
  // Mental and DOH of their legitimate current-year review work.
  if (targetYear === utilities().getFiscalYear().fiscalYear) return null;

  if (reviewer.level !== "ODPC") {
    return status(403, {
      message: `fiscal year ${targetYear} is closed; only ODPC may write to it`,
    });
  }
  return null;
};
```

The target year comes from the Cover. **No request value can nominate it** — that would let a caller
relabel which year it is editing and bypass the gate entirely. This is a security property.

### Call sites

```ts
// saveAnswerVerdict — after assertCoverAccess, before the Answer is read
const coverCheck = await helper.assertCoverAccess(coverId, region);
if (coverCheck instanceof ElysiaCustomStatusResponse) return coverCheck;

const yearCheck = await helper.assertYearWritable(coverId, reviewer);   // <- new
if (yearCheck instanceof ElysiaCustomStatusResponse) return yearCheck;
```

```ts
// finalize — the existing ODPC-only gate stays FIRST, with no DB read before it
if (level !== "ODPC") return status(403, { message: "finalize is restricted to ODPC" });

const coverCheck = await helper.assertCoverAccess(coverId, region);
if (coverCheck instanceof ElysiaCustomStatusResponse) return coverCheck;

const yearCheck = await helper.assertYearWritable(coverId, reviewer);   // <- new
if (yearCheck instanceof ElysiaCustomStatusResponse) return yearCheck;
```

### Ordering, and why it matters

The year gate runs **after** `assertCoverAccess`, never before. An out-of-region caller must keep
receiving today's 404 rather than a message revealing that a Cover exists in a particular year.
Error ordering is an information-disclosure decision, not a stylistic one.

In `finalize`, the level gate stays first and performs no database read, as it does today.

## Tests

| Coverage | Assertion |
|----------|-----------|
| ODPC, closed year | Write proceeds |
| DOED admin, closed year | Write proceeds — `adminReviewerContext` supplies `level: "ODPC"`, `region: null` |
| Mental, closed year | Refused with the closed-year message |
| DOH, closed year | Refused |
| **Mental, current year** | **Unaffected** — the regression this gate could most easily cause |
| **DOH, current year** | **Unaffected** |
| ODPC out of region, closed year | Existing 404, **not** the year message |
| Absent Cover | Existing 404 |
| `finalize` by a non-ODPC | Existing "finalize is restricted to ODPC", unchanged |
| A `finished` Answer | Immutable, ODPC included — unchanged |

Baseline to hold: **468 tests, 0 failures**; Biome at 3 errors / 30 warnings / 3 infos.

## Verification Beyond Tests

- `git status` must show **one** modified source file and **one** new test file. Any route,
  middleware, or schema file appearing in that list means the design was not followed.
- `grep` for `getFiscalYear()` in `src/service/` (excluding tests) must return **seven** no-argument
  calls — `cover.create`, `enroll.create`, `enroll.updateEnroll`, `answer.saveAnswer`,
  `answer.submit`, `answer.update`, `answer.negotiate` — plus the one this item adds in
  `assertYearWritable`, which reads the current year deliberately. **Corrected at execution: the
  plan originally said five, which under-counted `answer.ts` and omitted `cover.create`.**

## Out of Scope

- Factory write paths and the grace window → `factory-grace-window`
- Any change to region or category scoping
- `docs/adr/0008:56`
- Documentation: this item changes no public contract. The closed-year refusal is a new response
  condition on two existing endpoints and is documented with `factory-grace-window`, once the full
  write rule including Factory grace is settled. Splitting that across two items would leave
  `docs/api-conventions.md` describing half a rule.

---
*Plan approved at checkpoint. Execution follows.*
