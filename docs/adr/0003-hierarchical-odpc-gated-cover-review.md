# ADR 0003: Hierarchical, ODPC-gated Cover review

**Status:** Accepted (PO parameters resolved 2026-06-16; verdict model extended — see ADR-0004)

## Context

When a Factory submits a Cover (`in_progress → in_review`), Evaluators must inspect each Answer and either approve it or reject it with a comment. If every Answer is approved the Cover is `finished`; if any is rejected the Cover goes back to the Factory for re-evaluation, iterating until all Answers are approved, after which the final score is reported.

Evaluators carry two scoping dimensions already in the schema: `region` (which factories' Covers they see — already used) and `level` (`Mental | DOH | ODPC` — previously unused). The `level` values overlap the `QuestionCategories` (`Collaborate | Disease | Safety | Mental | Outcome`), signalling that review is split by category across multiple evaluators rather than performed by one.

The design space for "multiple evaluators reviewing one Cover" was the crux:

- **Peer review** — every level reviews its own categories independently and any level's rejection can transition the Cover. This forced a choice between *eager* bounce (first rejection sends the Cover back before others review) and *aggregate* bounce (wait for all levels), and — if levels could act while the Cover was also back with the Factory — a real concurrency problem: factory↔evaluator write races on Answers and races on the Cover-status decision itself, requiring per-Answer compare-and-set plus a Cover-level row lock.

## Decision

Adopt **hierarchical, ODPC-gated review** instead of peer review.

- **Mental** and **DOH** are tier-1 reviewers. Each owns a fixed subset of categories and renders verdicts only on its own categories. **Their submissions are non-finalizing** — the Cover stays `in_review`.
- **ODPC** is the final reviewer: it accesses all categories, evaluates the categories no tier-1 level owns, and may **backstop** any Answer Mental/DOH left `in_review`. **ODPC is the sole finalizer** — only ODPC's action transitions the Cover and returns the result to the Factory.
- **Override rule (revised 2026-06-16):** Tier-1 evaluators may edit *their own* verdicts only while the Cover is `in_review` (pre-commit) and never on another tier-1 level's categories. **ODPC has full override of any non-`finished` verdict on any category** within its finalize batch — it may re-score a tier-1 change-score or flip a tier-1 reject. **A `finished` Answer is immutable to everyone, ODPC included.** This *reverses* the original draft's "ODPC cannot override tier-1"; see ADR-0004 for the reasoning (ODPC is the accountable final gate, but settled answers are sacrosanct). Only the Factory acts on `rejected` Answers (accept a change-score, object, or redo).
- The verdict is a **single batch** written in one transaction. ODPC's finalize is valid only when **no Answer is left `in_review`**; then all `finished` → Cover `finished`, any `rejected` → Cover `in_progress`.
- **Three verdict outcomes** (extended in ADR-0004): **approve**, **change-score** (→ `rejected` + a Verdict Score + mandatory description), **reject** (→ `rejected` + mandatory description, files deleted). **Only ODPC's commit writes `finished`** — a tier-1 approve and a Factory-accept write the **`recommended`** status (provisionally settled, ODPC-overridable), which ODPC converts to `finished` at commit unless it overrides. This is what makes "tier-1 non-finalizing" literally true and keeps ODPC's override total (it never collides with an immutable `finished`). Re-submission is allowed when **no Answer is still `rejected`**.
- Status is **event-sourced** as before — current state is the latest `coverLogs` / `answerLogs` row. Two schema changes are required (revising the original "no schema change" claim): the additive `answerLogs.verdict_choice` column **and** a 4th `answerStatus` value `recommended` (see ADR-0004). The acting evaluator is recorded via `answerLogs.eval_id` and `coverLogs.evaluatorId`.

## Considered options

- **Peer review (rejected).** Symmetric levels, any level's rejection transitions the Cover. Rejected because it required either an awkward eager/aggregate bounce-timing choice or, under concurrent review, a full concurrency-control apparatus (per-Answer compare-and-set + Cover row lock) to prevent factory↔evaluator and Cover-status races.
- **Hierarchical, ODPC-gated (chosen).** A single finalizer plus the `in_review`-only write rule dissolves the concurrency problem entirely.

## Reasons

- **The single finalizer removes the races.** Because only ODPC writes the `coverLogs` transition and the Factory never holds the Cover while an Evaluator is active, there is no factory↔evaluator race and no Cover-status race — no locking apparatus needed.
- **Matches the real organisational hierarchy** — ODPC is the accountable authority that backstops and signs off tier-1 work.
- **No schema change** — reuses the existing `level`, the status enums, and the event-sourced log pattern.

## Consequences

- **ODPC is a single point of finalization.** No Cover can be sent back or finished without ODPC acting; ODPC availability gates throughput.
- **Tier-1 work can be silently superseded.** ODPC may complete (backstop) Answers Mental/DOH never reviewed. This is intentional but means a tier-1 level's silence does not block completion. Backstop actions are traceable via `eval_id`.
- **No re-opening of `finished` Answers** — once settled, an Answer is locked to *everyone* including ODPC. (Resolved: locked.)
- **ODPC override of tier-1 is now permitted** (pre-`finished`). This re-introduces a tier-1↔ODPC write ordering within the single batch, but **not** a concurrency race — the batch is one transaction by one ODPC actor, so the single-finalizer property that dissolves factory↔evaluator races still holds.
- **Schema changes** (superseding the original "no schema change" claim): `answerLogs.verdict_choice` column + a 4th `answerStatus` value `recommended` (see ADR-0004). Every existing `answerStatus` switch must be audited for the new value.

## Open questions (resolved 2026-06-16)

1. **Mental/DOH `level → category` map** — **Resolved:** DOH → `Disease`, `Safety`; Mental → `Mental`; ODPC → `Collaborate`, `Outcome` + all-access override.
2. **Re-opening approved Answers** — **Resolved:** `finished` is immutable to everyone (ODPC included). No re-open.
3. **Backstop audit governance** — **Resolved:** `eval_id` / `evaluatorId` traceability is sufficient; no explicit backstop marker.
4. **Email notifications** — **Resolved:** one email to the Factory on **every ODPC batch commit** (via `enrolls.email`) — both finalize-to-`finished` ("complete + Grade") and bounce-to-`in_progress` ("revision needed"); not state-visibility-only, and not limited to the `finished` case. No email for tier-1 submissions or Factory re-submissions. See ADR-0002 for email-worker scope.
