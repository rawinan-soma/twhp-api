---
id: past-year-write-authority
title: Past-fiscal-year write authority for DOED and ODPC
intent: fiscal-year-addressing
complexity: high
mode: validate
status: completed
depends_on:
  - fiscal-year-resolver
created: 2026-08-20T09:10:00Z
design_doc: past-year-write-authority-design.md
checkpoint_1: approved
migrated_from: memory-bank/bolts/032-out-of-year-writes
run_id: run-twhp-elysia-003
completed_at: 2026-08-22T15:18:47.204Z
---

# Work Item: Past-fiscal-year write authority for DOED and ODPC

## Description

Introduce the right to write a closed fiscal year, held by two authorities and expressed by a guard
the system cannot currently write.

Build evaluator-level-scoped middleware distinguishing `ODPC` from `Mental` and `DOH`, then apply
past-year write authority to the review, verdict, and finalize paths for `Role.DOED` and ODPC-level
Evaluators — region-scoped, non-expiring, and attributable.

## Acceptance Criteria

- [ ] ~~A new pre-composed guard exists~~ — **amended at Checkpoint 1: no new middleware.**
      `ReviewerContext` already carries `level`, and middleware cannot express this rule at all
      because it runs before the Cover is read and so cannot know the target fiscal year. The gate
      lives in `src/service/evaluator-review.ts`. See `past-year-write-authority-design.md`.
- [ ] An Evaluator at level `ODPC` proceeds; one at `Mental` or `DOH` is refused.
- [ ] Any other role is refused by the existing role check before any level lookup occurs.
- [ ] The level is resolved from the authenticated subject; no level value is accepted from the request.
- [ ] Existing routes using `evalGuard` are behaviourally unchanged.
- [ ] The fiscal year of a write is determined from the **target record**, never from request input.
- [ ] Current-year writes behave exactly as today for every role.
- [ ] Past-year writes succeed for `Role.DOED` and ODPC-level Evaluators on the verdict and finalize
      paths.
- [ ] Past-year writes by any other role or evaluator level are refused — except where the Factory
      grace window applies (`factory-grace-window`).
- [ ] ODPC region scoping is unchanged; closed-year authority does not widen geographic reach.
- [ ] Authority does not expire — a FY2026 Cover stays writable by DOED and ODPC indefinitely.
- [ ] Refusals are distinct and logged, separable from the existing wrong-region 404.
- [ ] Granted out-of-year writes record the acting identity.
- [ ] No database schema change of any kind.

## Technical Notes

**Reassessed at Checkpoint 1: substantially smaller than written.** Two service functions,
one gate each, no new files. The uncertainty below was investigated and largely resolved.

**Structural — resolved at Checkpoint 1.** The question was whether to look the level up per request
or widen the JWT. It is already answered by shipped code: `resolveEvaluator` reads the level from the
database on every request, and `adminReviewerContext` models a DOED admin as a national ODPC. The JWT
is untouched, so session lifetime and refresh rotation are unaffected. The rule reduces to a single
condition, `reviewer.level === "ODPC"`.

**Pre-existing.** `docs/business-rules.md` records that some evaluator detail routes call *unscoped*
services, so `assertCoverAccess` may not sit on every path needing a guard here. Verify which paths
actually centralise Cover authorisation before relying on that seam. The pre-existing gap is not this
intent's to fix — but do not build on it as though it were sound.

**Target-year-from-the-record is a security property, not a convenience.** If a write could nominate
its own fiscal year, a caller could relabel which year it is editing and route around the authority
check entirely.

Affected paths: `src/routes/{admins,evaluators}/covers/[coverId]/answers/[answerId]/verdict`,
`.../covers/[coverId]/finalize`, and the corresponding verdict services in `src/service/answer.ts`.

Note the interaction with the intent's accepted limitation on historical region: because
`provinces`/`districts` join through `factories` (current location), a relocated Factory changes the
apparent region of a closed year — which here affects **authorization**, not only visibility. Assert
the behaviour explicitly.

## Dependencies

- fiscal-year-resolver

## Source Stories

- `001-evaluator-level-guard` (Must)
- `002-past-year-write-authority` (Must)
