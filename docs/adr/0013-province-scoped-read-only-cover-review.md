# ADR 0013: Province-scoped read-only Cover review, with a status gate and verdict redaction

**Status:** Accepted (2026-09-03)

**Relates to:** ADR-0003, which defined Cover review for its *participants* (tier-1 Evaluators and
the ODPC finalizer). This ADR adds the first **non-participant reader** to that model. Nothing in
ADR-0003 changes: the Provincial Officer renders no verdict, holds no tier, and cannot finalize.

## Context

Provincial Officers could already see their province's factories, enrollments, and Score Reports —
but never the Cover itself. A province could see *that* a factory scored 78% without seeing which
Answers produced it or what evidence was filed. The province is accountable for its factories'
participation, so this read had to exist.

Two things made it more than "add a route with a province filter".

**Cover review is an open deliberation.** Between `in_review` and `finished`, Evaluators are still
recording, revising, and overriding each other's verdicts (ADR-0003's override rule; ADR-0012's
terminal score changes). A Verdict Score visible to a third party mid-review is a provisional
judgement presented as a settled one — and the Officer has no standing to contest it, since the
factory owns that right, not the province.

**An `in_progress` Cover is not submitted work.** It is the factory's private draft. Showing it to
the province would expose an unfinished self-assessment as if it were a filing.

There is also an existence-disclosure question: if an out-of-province Cover 404s but an
`in_progress` in-province Cover 403s, the pair of responses is an oracle that tells the Officer
which Covers exist in other provinces.

## Decision

Add a third `ReviewerScope` variant — `{ kind: "province"; province }` alongside the pre-existing
`region` and `national` — and serve the Officer through the **same** `evaluatorReviewService.getAnswers`
and the same `AnswerViewSchema` the Evaluator and DOED reads use.

Two rules fire only for this scope:

- **Status gate.** The Cover's latest status must be `in_review` or `finished`. An `in_progress`
  Cover returns `404 { message: "cover not found" }` — byte-identical to the out-of-province
  response.
- **Verdict redaction while `in_review`.** Every Answer's latest verdict choice and description are
  forced `null`, and its per-Answer `status` is forced `in_review`, regardless of the underlying
  record. At `finished` the redaction lifts entirely and the Officer sees what an Evaluator sees.

**Standard certificates are never redacted**, at either status — they are the factory's own
submission, not Evaluator output, so there is nothing of the review to protect.

The Officer resolves to evaluator level `ODPC`, **for category filtering only** — it is the level
whose category set is "all five", and carries no authority. No write route is exposed under
`provincialOfficers/**`: verdict-save and finalize live only under `evaluators/**` and `admins/**`.

## Considered options

- **A separate provincial read service (rejected).** A parallel query over the same tables would
  drift from the Evaluator read the first time the response shape changed, and would put the
  confidentiality rule in a second place. Reusing `getAnswers` keeps one owner.
- **Expose the full Evaluator view (rejected).** Leaks the open deliberation, as above.
- **Redact the verdict but show the per-Answer status (rejected).** Incoherent: a bare `rejected`
  or `recommended` already tells the Officer a verdict exists and roughly what it said. Hiding the
  value while publishing its shadow protects nothing.
- **`403` for an `in_progress` in-province Cover (rejected).** Distinguishable from the
  out-of-province `404`, which turns the pair into an existence oracle.

## Reasons

- **One module owns the read**, so the response shape cannot diverge between reader roles, and the
  redaction cannot be forgotten by a future route — it lives in the service, not the route, so
  anything reusing `getAnswers` under a province scope inherits it.
- **The gate and the redaction are keyed on the scope discriminator**, so Evaluator and DOED reads
  of the same Cover are provably unaffected — the new branches cannot fire for them.
- **Identical 404s** mean the Officer learns nothing from the difference between "not yours" and
  "not submitted yet".
- **Consistent with what the Officer can already retrieve.** Once a Cover is `finished` its Grade is
  already visible in the Score Report; unredacting the detail behind a settled outcome exposes
  nothing new.

## Consequences

- **`getAnswers` now has a scope-dependent response.** The same Cover yields different verdict
  fields to an Evaluator and an Officer. Any consumer reasoning about a response must know which
  scope produced it, and every future change to the verdict fields needs a province-scope test
  alongside the Evaluator one.
- **Level `ODPC` on the Officer is a footgun.** It means "all five categories", not "ODPC
  authority". If a write path is ever added under `provincialOfficers/**`, it must not treat that
  level as permission to finalize. The absence of such a route is currently the only thing
  enforcing this.
- **The redaction is a read-time mask, not a storage rule.** The underlying `answerLogs` are
  unchanged, so the confidentiality guarantee holds only for readers that go through `getAnswers`.
  A future export, report, or admin query over `answerLogs` would have to re-apply it.
- **`in_progress` invisibility is absolute** — an Officer cannot tell whether a factory in their
  province has started a Cover at all. That is deliberate, and it means the province cannot use
  this endpoint to chase non-submitters; the enrollment and Score Report lists remain the tools for
  that.
