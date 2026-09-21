# ADR 0014: The five-grade ladder, the FY − 3 rule, and the settled gold gate

**Status:** Accepted (2026-09-21)

**Builds on:** [ADR-0001](0001-score-calculated-on-demand.md) (amended: the Grade is stored at finalize).
The `Awards` table that this ADR reads is what that amendment introduced.

## Context

Until now there were four Grades, and a Cover's Grade depended only on its own Answers. Two things
changed together:

1. A top tier, **`consec-gold`**, for a factory that held gold three fiscal years earlier.
2. A recorded conflict over the `gold` special-question gate had to be settled. `CONTEXT.md` said
   *full score on every question where `special` is `1` or `3`*; the deployed calculator gated on every
   `special > 0` Question, including the five at `special == 2`. BR-23, the conflict table in
   `docs/domain-model.md` and TD-06 all listed it as unsettled, with the code named authoritative.

## Decision

Five grades, evaluated strictly top-down, first match wins:

| Grade | Gate |
| --- | --- |
| `consec-gold` | the `gold` gate **and** every `special == 2` Answer scored `"3"` **and** a gold-tier award in fiscal year FY − 3 |
| `gold` | every category > 80%, total >= 90%, every `special == 1` and `special == 3` Answer scored `"3"` |
| `silver` | every category > 60% and total >= 80% |
| `certificate` | total >= 60% |
| `joined` | otherwise |

**The `gold` gate was settled in favour of `CONTEXT.md`; it was not invented.** Against the documented
rule nothing changed. Against the *deployed code* `gold` becomes easier to reach, because the five
`special == 2` Questions stop gating it. The `consec-gold` special gate — `special` in `{1, 2, 3}` — is
exactly what the code gated `gold` on before, so the old behaviour moved up one tier and acquired a
history check.

**"Held a gold-tier award in FY − 3"** means the `Awards` table holds a row for that factory and that
fiscal year whose grade is `gold` or `consec-gold`. Where the row came from does not matter — a
finalize or the FY2566 import. No row, or a `silver`/`certificate`/`joined` row, means not held.

- **Only FY − 3 is read.** FY − 1 and FY − 2 are not consulted and their absence is not a
  disqualification; a gold winner is locked out of those years by design (the enrolment lockout).
- **FY − 3 is the Cover's own fiscal year minus 3**, in Common Era — not the current year minus 3. A
  past-year Cover finalized after rollover looks back from its own year. Fiscal years are integers, so
  the lookup is arithmetic, not a date window.
- **`n/a` never satisfies a special gate.** The gate needs the literal choice `"3"`, though `n/a` is
  excluded from the percentages. A first-year factory answering *เข้าร่วมเป็นปีแรก* on the one
  `special == 2` Question that offers it is therefore not eligible for `consec-gold`.

### The enrolment lockout

An award in fiscal year A closes enrolment creation in A + 1 and A + 2; A + 3 is open
(`GOLD_ENROLMENT_LOCKOUT_YEARS = 2`). `enrollService.create` asks
`awardHistory.enrolmentLockedUntil(factoryId, Y)`, which walks Y − 1 and Y − 2 through the same
`heldGoldTierIn` the grading path uses and returns the first fiscal year the factory may enrol in, or
`null`. It runs after the duplicate-enrolment guard and before any upload, so a rejected enrolment
leaves no object in storage. Rejection is 400. The message names that year in Common Era — the
convention the API uses everywhere — and its wording is a placeholder until the maintainer supplies
the Thai text. Only creation is guarded; there is no administrative override.

### Where the rule lives

- **`computeGrade(breakdown, answers, history)`** stays pure and synchronous. The FY − 3 result is an
  **input** (`GradeHistory.heldGoldTierInFyMinus3`), resolved by the caller — so a list path could
  resolve a whole page's history in one batched query (ADR-0011) rather than one per item. Today only
  finalize computes a Grade; every read path returns the stored value.
- **`src/service/awardHistory.ts` is the one reader** of `Awards` for the question "did this factory
  hold a gold-tier award in fiscal year Y". Grading at finalize and the enrolment lockout both ask it,
  through `goldTierFactoriesIn` (batched, one query) or `heldGoldTierIn`. A second ad-hoc query over
  `Awards` for this question is a review failure, on the same footing as `coverStatus.ts` (ADR-0010).
- The `Grades` database enum, `GradeSchema` and the `Grade` type all derive from `GRADE_VALUES` in
  `src/drizzle/grades.ts`; the lookback distance and the gold-tier set live beside it.
- The result email maps every Grade to a Thai label in `src/worker/gradeLabel.ts`, typed
  `Record<Grade, string>` so a new Grade without a label fails compilation instead of printing its raw
  key. `consec-gold` is *…ประเภท โล่ทองต่อเนื่อง*.

## Consequences

- **A deliberate discontinuity.** Already-`finished` Covers keep the Grade they were stored with; no past
  Cover is re-scored, because the Grade is stored at finalize. Covers finalized after this change use the
  new ladder, so two Covers with identical Answers can carry different Grades either side of the release.
  The release note must say so.
- Adding a value to a Postgres enum is not reversible by `db:push`; apply it to a disposable database
  first. The value is added before `gold`, matching ladder order.
- The Outcome category is all-or-nothing for `consec-gold` specifically: all four Outcome Questions are
  `special == 2`. The gates read the `special` column — treat the counts as data, not constants.
- The worker bakes its source in at build (see CLAUDE.md): `worker-dev` must be rebuilt for the new
  label, or a `consec-gold` factory is emailed its raw grade key.
- A six-year tier is not built. The ladder is a list of rungs, each a predicate, so a further tier is a
  new gate above `consec-gold`, not a rewrite of the ones below.

## Considered options

- **Keep gating `gold` on `special > 0` and add `consec-gold` above it (rejected).** It would leave the
  recorded conflict unsettled and make `consec-gold` indistinguishable from `gold` on Answers alone.
- **Let `computeGrade` query `Awards` itself (rejected).** It would stop being pure and force one query
  per item on any list path.
- **Consult FY − 1 and FY − 2 as well (rejected).** A gold winner cannot enrol in those years, so their
  absence carries no information.
