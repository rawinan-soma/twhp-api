# ADR 0004: Verdict scores resolved by an unbounded consensus loop

**Status:** Accepted (2026-06-16)

## Context

ADR-0003 established hierarchical, ODPC-gated review where each Answer is **approved** or **rejected** (binary). In practice, evaluators do not only accept/reject — they frequently judge that a factory's self-reported choice is *wrong* (e.g. the factory claimed `3` but the evidence supports `1`) and want to **correct the score**, not just bounce the whole Answer.

This forces three questions ADR-0003 did not answer:

1. Can an evaluator assign a corrected score, and where does it live (the `Score` is "never persisted", and `answers.selectedChoice` is the factory's own datum)?
2. When the evaluator and factory disagree on the value, **who wins**?
3. What does the final Score/Grade compute from — the factory's claim or the evaluator's correction?

## Decision

Introduce an evaluator **Verdict Score** and resolve disputes by an **unbounded consensus loop**.

- **Verdict Score** — a per-Answer choice override recorded on a new nullable `answerLogs.verdict_choice` column (the `Choices` enum **restricted to `0–3`, never `n/a`**) plus a mandatory `description`. The factory's `answers.selectedChoice` is **never overwritten**; both coexist so the UI shows "your score vs. our verdict".
- **Three verdict outcomes** replace the binary: **approve**, **change-score** (→ `rejected` + `verdict_choice` + description), **hard reject** (→ `rejected`, null `verdict_choice`, + description; files deleted). Change-score and reject reuse the `rejected` status, distinguished by `verdict_choice` presence.
- **Only ODPC finalizes (`finished`).** A tier-1 approve and a Factory-accept write a new **`recommended`** `answerStatus` (provisionally settled, ODPC-overridable); ODPC converts un-overridden `recommended` Answers to `finished` at its commit. This resolves the contradiction between "tier-1 non-finalizing", "approve → finished", and "`finished` immutable" (Gap 1): there was no representable state for *approved-but-still-overridable*. Cost: `answerStatus` grows to 4 values.
- **Negotiation (consensus) loop** — a change-score is a *proposal*. When ODPC's batch bounces the Cover, the factory either **accepts** (Answer → `recommended`; the Verdict Score becomes the live choice; ODPC finalizes; the normal per-choice file validator applies, so an upward accept needs supporting files) or **objects** (a free re-answer with managed evidence → `in_review`, re-judged by the owning level). This repeats **without bound**; **neither side can force the value**. The loop ends only by agreement.
- **Live choice** — the Score and Grade compute from each Answer's *most recently accepted* choice: the factory's `selectedChoice` by default, replaced by a Verdict Score only once the factory accepts it. Open verdicts do not move the Score.
- **Grade** (`gold`/`silver`/`certificate`/`joined`) is computed for `finished` Covers from live choices, returned in the finalize response **and** added to the Score Report / list endpoints (`grade` field, `null` for non-`finished`) so it is retrievable after the finalize email (Gap 2). Still computed on-demand, never persisted; ADR-0001's "no new score endpoint" holds. Tiers are evaluated strictly top-down with overall **floors** (`≥90`/`≥80`/`≥60`/`<60`), not closed bands — see the Grade definition in `CONTEXT.md`.

## Considered options

- **ODPC force-sets the final score (rejected).** ODPC's verdict is final; the factory cannot contest. Simpler and always-terminating, but removes the factory's right to defend its evidence and makes ODPC's judgement unaccountable to the source data. PO explicitly wanted the factory to be able to object with additional evidence.
- **Bounded negotiation — N rounds then forced (rejected).** Cap the loop, then ODPC's value wins. Terminates, but the cap is arbitrary and re-introduces the "ODPC forces the value" outcome at the boundary.
- **Unbounded consensus (chosen).** Mirrors the real review relationship — correction is a dialogue, settled by agreement. Accepts non-termination as a tolerable, human-resolvable risk.

## Reasons

- **Matches the real process** — an evaluator proposing a corrected score and a factory defending its evidence is a negotiation, not a fiat.
- **Preserves provenance** — keeping `selectedChoice` and `verdict_choice` separate means the original claim, every proposal, and the accepted value are all reconstructable from `answerLogs`.
- **Contained schema impact** — one additive nullable column (`verdict_choice`) plus one new `answerStatus` value (`recommended`); reuses the `rejected` status for both send-backs and the event-sourced log.
- **Keeps the single-finalizer guarantee** — ODPC still owns the Cover transition; the loop changes only *the score value*, which the factory can contest, not *who moves the Cover*.

## Consequences

- **A Cover may never settle.** With no forced resolution, a factory and evaluator who never agree leave the Cover oscillating `in_review`↔`in_progress` forever. This is the deliberate trade-off; mitigation (an escalation path, an admin override, or a deadline) is **not** in v1 and would be a future ADR.
- **The final Score is no longer the pure factory self-report** — it reflects accepted verdict corrections. Consumers of `GET /factories/assessments/score` must understand "live choice" semantics.
- **`n/a` is one-directional** — evaluators can pull a factory `n/a` into scoring (assign `0–3`) but can never push a scored Answer out to `n/a`.
- **File lifecycle couples to outcome** — change-score preserves files (the factory needs them to object); hard reject deletes them at ODPC commit. The factory manages evidence freely on objection/redo.
