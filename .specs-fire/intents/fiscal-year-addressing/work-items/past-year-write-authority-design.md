---
work_item: past-year-write-authority
intent: fiscal-year-addressing
created: 2026-08-22T00:00:00Z
mode: validate
checkpoint_1: approved
---

# Design: Past-fiscal-year write authority for DOED and ODPC

## Summary

Permit writes to a closed fiscal year, but only from `Role.DOED` and from an `Evaluator` at level
`ODPC`. Refuse them from every other caller.

The work item assumed this needs new level-scoped middleware. **It does not.** Reading the code
first showed the system already carries everything required, and that middleware is the wrong seam
for the rule. The result is materially smaller than the work item describes: two service functions,
one gate each, no new files.

## Scope

**In Scope:**
- A fiscal-year gate on `saveAnswerVerdict` and `finalize` in `src/service/evaluator-review.ts`
- Resolving the target Cover's fiscal year from its Enrollment
- A distinct, logged refusal for an unauthorised out-of-year write
- Actor attribution on granted out-of-year writes

**Out of Scope:**
- New middleware of any kind
- Factory write paths and the grace window → `factory-grace-window`
- Any change to region or category scoping
- The unresolved left/inner join asymmetry in `docs/adr/0008:56`
- Reopening a `finished` Answer, which stays immutable to everyone including ODPC

## Findings That Changed This Design

**1. `ReviewerContext` already carries the evaluator level.**

```ts
export type ReviewerContext = {
  accountId: number;
  level: EvaluatorLevel;   // Mental | DOH | ODPC
  region: number | null;   // null = national
};
```

Every review path already builds one. The level is available at the point of the write.

**2. The per-request database lookup already exists.** `resolveEvaluator` calls
`evaluatorService.helper.getEvaluatorData(callerId)` on every request and reads the level from the
database. The design question recorded at migration — "per-request lookup, or widen the JWT?" — is
already answered by shipped code. The lookup is the established pattern and costs nothing new. The
JWT stays untouched, so session lifetime and refresh rotation are unaffected.

**3. A DOED admin is already modelled as a national ODPC.**

```ts
export const adminReviewerContext = (accountId: number): ReviewerContext => ({
  accountId, level: "ODPC", region: null,
});
```

So "DOED **and** ODPC may write a closed year" collapses to a single condition:
**`reviewer.level === "ODPC"`**. The domain unified these actors already; this design does not
re-unify them.

**4. The exact pattern is already in production.** `finalize` gates on level today:

```ts
if (level !== "ODPC") {
  return status(403, { message: "finalize is restricted to ODPC" });
}
```

This design follows that shape rather than inventing one.

**5. Middleware cannot express the rule.** Middleware runs before the Cover is read, so it cannot
know which fiscal year the target belongs to. The decision requires the record. It therefore belongs
in the service, next to `assertCoverAccess`, which already resolves Cover-level authorisation.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location of the check | Service layer, not middleware | Middleware cannot see the Cover and so cannot know the target fiscal year |
| Identifying the authority | `reviewer.level === "ODPC"` | A DOED admin is already a national ODPC; one condition covers both actors |
| New middleware | **None** | `ReviewerContext` already carries the level; `evalGuard` and `adminGuard` are unchanged |
| Level resolution | Existing per-request lookup | Already shipped in `resolveEvaluator`. Widening the JWT would reach into session lifetime and refresh rotation for no gain |
| Source of the target year | The Cover's Enrollment | A request must never nominate its own year — that would let a caller relabel which year it edits and bypass the gate entirely |
| Gate condition | Applies **only** when the target year is not current | A blanket ODPC-only rule would strip Mental and DOH of their legitimate current-year work |
| Region scope | Unchanged | `assertCoverAccess` already enforces it. Authority over a closed year does not widen geographic reach |
| Expiry | None | DOED and ODPC authority does not lapse; a FY2026 Cover stays writable indefinitely |

## Data Models Affected

**None.** No column, index, constraint, or enum value. No migration.

## Technical Approach

### Architecture

```
  route (evalGuard | adminGuard)
        │
        ▼
  ReviewerContext { accountId, level, region }     <- already built, already carries level
        │
        ▼
  saveAnswerVerdict / finalize
        │
        ├─ resolve target fiscal year from the Cover's Enrollment
        │     covers.enroll_id -> enrolls.enroll_date -> getFiscalYearOf()
        │
        ├─ target == current  ──────────────► unchanged behaviour for every level
        │
        └─ target != current
                 ├─ level === "ODPC" ───────► allow, attribute the actor
                 └─ otherwise ──────────────► refuse (distinct status), log
```

### The gate

```ts
const assertYearWritable = async (coverId: number, reviewer: ReviewerContext) => {
  const targetYear = await helper.fiscalYearOfCover(coverId);
  if (targetYear === null) return status(404, { message: "cover not found" });

  const currentYear = utilities().getFiscalYear().fiscalYear;
  if (targetYear === currentYear) return null;              // unchanged for every level

  if (reviewer.level !== "ODPC") {
    return status(403, {
      message: `fiscal year ${targetYear} is closed; only ODPC may write to it`,
    });
  }
  return null;
};
```

`fiscalYearOfCover` is a new helper beside `assertCoverInRegion`: join `covers` to `enrolls`, read
`enroll_date`, and pass it to `utilities().getFiscalYearOf()`. The fiscal-year rule is not
re-derived locally.

### Ordering

`finalize` gates on level **before** any database read today. That ordering is deliberate and is
preserved: the ODPC-only check stays first, and the year gate runs after `assertCoverAccess`, so a
caller outside its region still receives the existing 404 rather than a year-related message.

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `src/service/evaluator-review.ts` | Modify | Add `fiscalYearOfCover` helper and `assertYearWritable`; call it from `saveAnswerVerdict` and `finalize` |
| `src/service/evaluator-review.pastyear.test.ts` | Create | Gate coverage across levels, years, and regions |

No route file changes. No middleware changes. No schema changes.

## Security Considerations

- **The target year comes from the record, never the request.** If a write could nominate its own
  fiscal year, a caller could relabel which year it is editing and route around the gate. This is a
  security property, not a convenience.
- **No scope widening.** The gate only ever refuses. It cannot grant access to a Cover that
  `assertCoverAccess` would reject.
- **`finished` stays immutable.** A finished Answer is immutable to everyone, ODPC included
  (`CONTEXT.md`). This design must not weaken that, and adds no path that could.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| A blanket ODPC-only rule | High — Mental and DOH lose legitimate current-year review | The gate applies only when the target year is not current. Asserted directly for both tier-1 levels |
| Refusal indistinguishable from a missing record | Medium — support cannot separate a permission failure from a 404 | Distinct message naming the closed year; logged through the existing `onError` flow |
| Error ordering changes | Medium — a wrong-region caller learns a year exists | Year gate runs after `assertCoverAccess`, preserving today's 404 |
| Reading the Cover twice | Low | `fiscalYearOfCover` is one small joined read; reuse the existing access check rather than duplicating it |
| Someone later moves this into middleware | Medium — it would silently stop working | The reason middleware cannot express the rule is recorded here and in the code comment |

## Implementation Checklist

- [ ] Add `fiscalYearOfCover(coverId)` to the evaluator-review helper — join `covers` to `enrolls`,
      resolve via `utilities().getFiscalYearOf()`
- [ ] Add `assertYearWritable(coverId, reviewer)`
- [ ] Call it in `saveAnswerVerdict`, after `assertCoverAccess`
- [ ] Call it in `finalize`, after `assertCoverAccess`, keeping the existing level gate first
- [ ] Assert: ODPC writes a closed year; DOED admin writes a closed year (as national ODPC)
- [ ] Assert: Mental and DOH are refused for a closed year
- [ ] Assert: Mental and DOH are **unaffected** for the current year
- [ ] Assert: an out-of-region ODPC still receives the existing 404, not the year message
- [ ] Assert: a `finished` Answer stays immutable, ODPC included
- [ ] Confirm no route, middleware, or schema file changed
- [ ] Suite holds at 468 tests, 0 failures; Biome at 3 / 30 / 3

## Correction to the Work Item

`past-year-write-authority.md` states that new level-scoped middleware is required and that
`evalGuard` "cannot express this rule". The second half is true; the first is not. The rule cannot be
expressed in middleware **by anyone**, because middleware cannot see the target record. The work item
is amended at Checkpoint 1 to match this design.

---
*Generated by specs.md - fabriqa.ai FIRE Flow | Checkpoint 1 approved: 2026-08-22*
