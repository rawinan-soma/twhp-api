# ADR 0003: Hierarchical, ODPC-gated Cover review

**Status:** Proposed (some parameters pending PO — see Open questions)

## Context

When a Factory submits a Cover (`in_progress → in_review`), Evaluators must inspect each Answer and either approve it or reject it with a comment. If every Answer is approved the Cover is `finished`; if any is rejected the Cover goes back to the Factory for re-evaluation, iterating until all Answers are approved, after which the final score is reported.

Evaluators carry two scoping dimensions already in the schema: `region` (which factories' Covers they see — already used) and `level` (`Mental | DOH | ODPC` — previously unused). The `level` values overlap the `QuestionCategories` (`Collaborate | Disease | Safety | Mental | Outcome`), signalling that review is split by category across multiple evaluators rather than performed by one.

The design space for "multiple evaluators reviewing one Cover" was the crux:

- **Peer review** — every level reviews its own categories independently and any level's rejection can transition the Cover. This forced a choice between *eager* bounce (first rejection sends the Cover back before others review) and *aggregate* bounce (wait for all levels), and — if levels could act while the Cover was also back with the Factory — a real concurrency problem: factory↔evaluator write races on Answers and races on the Cover-status decision itself, requiring per-Answer compare-and-set plus a Cover-level row lock.

## Decision

Adopt **hierarchical, ODPC-gated review** instead of peer review.

- **Mental** and **DOH** are tier-1 reviewers. Each owns a fixed subset of categories and renders verdicts only on its own categories. **Their submissions are non-finalizing** — the Cover stays `in_review`.
- **ODPC** is the final reviewer: it accesses all categories, evaluates the categories no tier-1 level owns, and may **backstop** any Answer Mental/DOH left `in_review`. **ODPC is the sole finalizer** — only ODPC's action transitions the Cover and returns the result to the Factory.
- **Override rule:** any Evaluator may act only on an Answer whose latest log is `in_review`; `finished`/`rejected` Answers are immutable to Evaluators. This is how ODPC "cannot override" Mental/DOH. Only the Factory reopens a `rejected` Answer, by editing it.
- The verdict is a **single batch** written in one transaction. ODPC's finalize is valid only when **no Answer is left `in_review`**; then all `finished` → Cover `finished`, any `rejected` → Cover `in_progress`.
- **Approve = `finished`** at the Answer level (no `approved` enum value). **Sticky approvals:** approved Answers carry across re-evaluation cycles and are never re-reviewed; re-submission is allowed when **no Answer is still `rejected`** (replacing the prior "all Answers `in_review`" submit guard).
- Status is **event-sourced** as before — current state is the latest `coverLogs` / `answerLogs` row; no status columns and no schema change. The acting evaluator is recorded via `answerLogs.eval_id` and `coverLogs.evaluatorId`.

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
- **No re-opening of approved Answers** in this design — once `finished`, an Answer is locked to Evaluators (pending PO).
- **State-visibility, not notifications, in v1** — "sent to evaluators / factory" is a status change surfaced in list endpoints; no email, keeping this feature off the login-critical email worker (ADR-0002). Pending PO.

## Open questions (pending PO)

1. **Mental/DOH `level → category` map** — which categories each tier-1 level owns (ODPC takes the remainder + all-access).
2. **Re-opening approved Answers** — may an Evaluator revert a `finished` Answer? Currently locked.
3. **Backstop audit governance** — is `eval_id` traceability sufficient, or must ODPC backstopping tier-1 work be distinguished explicitly?
4. **Email notifications** — required (Factory emailed on results, Evaluators on submission) or state-visibility only?
