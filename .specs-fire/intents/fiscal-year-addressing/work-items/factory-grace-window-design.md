---
work_item: factory-grace-window
intent: fiscal-year-addressing
created: 2026-08-22T16:00:00Z
mode: validate
checkpoint_1: approved
---

# Design: 31-day Factory grace window for unfinished prior-year Covers

## Summary

For 31 days after the fiscal-year boundary, a Factory may continue to complete a prior-year Cover
that has not reached `finished`. Outside that window it reverts to read-only for that year.

This is the half of the intent that answers the originating concern: DOED and ODPC authority
(`past-year-write-authority`) rescues stalled *reviews*, but cannot supply a Factory's unsubmitted
answers. Only the Factory can.

## Scope

**In Scope:**
- A single declared grace policy, expressed relative to the rollover boundary
- An optional `fiscalYear` parameter on the four Factory write paths, defaulting to the current year
- Grace-permitted completion: `saveAnswer`, `update`, `submit`, `negotiate`
- Refusal of prior-year writes outside the window, and of enrollment writes at any time

**Out of Scope:**
- `cover.create`, `enroll.create`, `enroll.updateEnroll` — grace does not start a new assessment or
  edit closed-year enrollment data
- Any scheduled job, sweep, or persisted expiry marker
- Reopening a `finished` Cover
- Notifications of any kind
- Any database schema change

## The Structural Finding

The Factory write paths are shaped differently from the evaluator paths gated in
`past-year-write-authority`, and the difference determines this design.

| | Evaluator paths (run 003) | Factory paths (this item) |
|---|---|---|
| The caller names | a `coverId` | nothing |
| The service does | reads that Cover's year and decides | **selects** the Cover *by* the current-year window |
| Grace is therefore | a gate that refuses | a **widening of what can be selected** |

```ts
// submit(), and the same shape in saveAnswer / update / negotiate:
const cover = await database.select(...)
  .where(and(
    eq(enrolls.factoryId, factoryId),
    gte(enrolls.enrollDate, fiscalYearStart.toISOString()),   // the year IS the selector
    lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
  ))
  .limit(1);
```

A gate cannot be attached to this. There is no target to gate — the window is how the target is
found.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mechanism | Widen the selection window, not a refusal gate | The window is the selector; there is nothing to gate |
| Year source | An optional `fiscalYear` parameter, defaulting to the current year | Widening the window while keeping `.limit(1)` would pick arbitrarily between two legitimately open years — the "implicit most-recent selection" the requirements forbid |
| Why that is safe here | `factoryId` comes from the JWT subject | The query is already constrained to the caller's own records. Naming a year selects among its **own** Covers and grants nothing |
| Policy expression | *31 days after the rollover boundary*, declared once | Literal 2026 dates would silently stop applying in FY2028 with no failing test |
| Paths covered | `saveAnswer`, `update`, `submit`, `negotiate` | Cover completion only |
| Paths refused | `cover.create`, `enroll.create`, `enroll.updateEnroll` | Closed-year enrollment stays immutable to its owner; grace does not start a new assessment |
| Expiry | Evaluated at write time | No sweep, no job, no persisted flag. Expiry is a change in who may write, not in what the Cover is |
| Scope of grace | Only the **immediately preceding** fiscal year | FY2025 is not writable during October 2026 |

### On contradicting run 003

`past-year-write-authority` established that *"a write must never nominate its own fiscal year"*. That
rule is retained where it applies, and it does not apply here.

In run 003 the caller supplied a `coverId` that could belong to any Factory, so allowing the request
to also name the year would have let a caller relabel which year it was editing — a privilege
escalation. Here the caller supplies no identifier at all: `factoryId` is taken from the JWT subject
and the query is already scoped to that Factory's own records. Naming a year chooses among records
the caller already owns.

The distinction is **whose records the year selects from**, not whether a year may be named.

## Already Satisfied by Existing Code

Three acceptance criteria are enforced today and must be cited rather than rebuilt:

| Criterion | Enforced by |
|-----------|-------------|
| A `finished` Cover is never reopened | `submit` and `negotiate` require the latest cover log to be `in_progress` |
| A prior-year `in_review` Cover is not Factory-writable | the same check |
| Answer updates are status-constrained | `update` requires the answer to be `in_review` or `rejected` |

## Investigated and Closed: the `saveAnswer` status question

An earlier draft of this design flagged `saveAnswer` as a gap, because it carries no cover-status
guard. **Investigation showed it is not reachable.** No additional guard is required, and adding one
would be dead code.

`saveAnswer` refuses when an answer already exists for the question:

```ts
if (existingAnswer) return status(400, { message: "existed answer" });
```

It can therefore only ever *create* an answer, never modify one. And `submit` refuses unless every
question is answered:

```ts
return status(400, { message: "not all questions have been answered" });
```

The two compose into a guarantee:

> A Cover reaches `in_review` only when every question already has an answer, so `saveAnswer` always
> refuses on a submitted Cover.

Under grace a prior-year `in_review` Cover becomes reachable, and `saveAnswer` still refuses every
question on it. The mutation paths `update` and `negotiate` carry their own explicit status guards.

**The protection is real but indirect.** It depends on `submit`'s completeness rule remaining in
place. If submission were ever relaxed to allow partial answers, `saveAnswer` would silently become
writable on an `in_review` Cover and nothing would fail. This design therefore adds a **test stating
the invariant**, rather than a defensive check that is unreachable today.

## Data Models Affected

**None.** No column, index, constraint, or enum value. No migration.

## Technical Approach

### Policy

```ts
/** Days after the rollover boundary during which a Factory may still finish the prior year. */
const GRACE_DAYS = 31;

/**
 * Whether Factory grace admits a write to `targetYear` at `now`.
 * Consumes the fiscal-year resolver; performs no local date arithmetic.
 */
const factoryGraceApplies = (targetYear: number, now = new Date()) => {
  const currentYear = utilities().getFiscalYearOf(now);
  if (targetYear !== currentYear - 1) return false;          // only the immediately preceding year
  const { fiscalYearStart } = utilities().getFiscalYear(currentYear);
  return now.getTime() < fiscalYearStart.getTime() + GRACE_DAYS * 86_400_000;
};
```

Expressed relative to `fiscalYearStart`, so it means "31 days after rollover" in every fiscal year,
not only 2026.

### Write-path resolution

```ts
saveAnswer: async (factoryId: number, dto: CreateAnswerWithFilesDto, fiscalYear?: number) => {
  const targetYear = fiscalYear ?? utilities().getFiscalYearOf(new Date());
  const currentYear = utilities().getFiscalYearOf(new Date());

  if (targetYear !== currentYear && !factoryGraceApplies(targetYear)) {
    return status(403, {
      message: `fiscal year ${targetYear} is closed to factories`,
    });
  }

  const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(targetYear);
  // ... existing lookup, now scoped to the resolved year
}
```

The same shape in `update`, `submit`, and `negotiate`.

### Ordering

The grace decision happens **before** the Cover lookup, because it decides which window the lookup
uses. This is the reverse of `assertYearWritable` in run 003, and deliberately so — there the target
already existed; here the decision determines what the target is.

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `src/service/answer.ts` | Modify | `fiscalYear` parameter and grace check on `saveAnswer`, `update`, `submit`, `negotiate` |
| `src/utils.ts` *or* a new policy module | Modify/Create | `GRACE_DAYS` and `factoryGraceApplies`, declared once |
| `src/routes/factories/assessments/index.ts` | Modify | Accept and forward `fiscalYear` on the four write endpoints |
| `src/service/factory-grace.test.ts` | Create | Window boundaries, path coverage, refusals |

## Security Considerations

- **No privilege escalation.** `factoryId` continues to come from the JWT subject on every path. The
  year parameter selects among the caller's own records and cannot reach another Factory's data.
- **Enrollment stays immutable.** `enroll.create` and `enroll.updateEnroll` are untouched and remain
  current-year only, during and after the window.
- **File I/O stays outside transactions.** A grace submission failing near the end of the window must
  not leave orphaned objects at exactly the moment the Factory loses the ability to retry.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ~~`saveAnswer` reaches an `in_review` prior Cover~~ — **investigated, not reachable** | — | `saveAnswer` refuses when an answer exists, and `submit` requires all questions answered. Protection is indirect, so an invariant test is added instead of a redundant guard |
| The window duplicated across four call sites | High — a Factory admitted by one path and refused by the next loses its work at the last step | One declared policy, one predicate, consulted everywhere |
| Literal 2026 dates | Medium — grace silently stops applying in FY2028 | Expressed relative to `fiscalYearStart`; asserted for a later fiscal year in tests |
| Wrong-year write while two years are open | High — silent data corruption | The explicit `fiscalYear` parameter is precisely this control |
| Grace evaluated against host-local time | Medium — the window opens or closes hours early | Consumes the resolver, which is single-clock and `Asia/Bangkok`-pinned |

## Implementation Checklist

- [ ] Declare `GRACE_DAYS` and `factoryGraceApplies` in one place
- [ ] Add a test asserting the `saveAnswer` invariant: a submitted Cover has every question
      answered, so `saveAnswer` refuses on it. **Do not add a status guard — it is unreachable.**
- [ ] Add `fiscalYear` to `saveAnswer`, `update`, `submit`, `negotiate`, defaulting to current
- [ ] Refuse a non-current year outside the window, with a distinct logged response
- [ ] Forward `fiscalYear` from the four Factory write routes
- [ ] Assert: grace applies at 2026-10-31 23:59:59.999 Bangkok, not at 2026-11-01 00:00:00.000
- [ ] Assert: only the immediately preceding year is covered; FY2025 is not, in October 2026
- [ ] Assert: current-year writes are unchanged for every path
- [ ] Assert: prior-year enrollment create and update stay refused, during and after the window
- [ ] Assert: a `finished` Cover is not reopened; an `in_review` Cover is not Factory-writable
- [ ] Assert: the window still means "31 days after rollover" in a later fiscal year
- [ ] Confirm no schema change, no scheduled job, no persisted flag
- [ ] Suite holds at 480 tests, 0 failures; Biome at 3 / 30 / 3

## Relationship to `concurrent-years-and-audit`

The `fiscalYear` parameter introduced here is the mechanism that makes two open years resolvable, so
it lands in this item. `concurrent-years-and-audit` then **verifies** that behaviour across every
`.limit(1)` self-read and adds the audit trail, rather than introducing the mechanism itself.

---
*Generated by specs.md - fabriqa.ai FIRE Flow | Checkpoint 1 approved: 2026-08-22*
