# ADR 0005: Per-answer verdict save with a separate ODPC finalize

**Status:** Accepted (2026-07-02)

**Supersedes:** the "single batch, one transaction, no partial/per-answer save" mechanism of ADR-0003 and the "ODPC has a single action — `commit`" framing. The *domain rules* those ADRs established (hierarchical review, ODPC as sole finalizer, the four-value `answerStatus`, the [[Verdict Score]] and unbounded [[Negotiation Loop]]) are **unchanged** — only how verdicts are *written* changes.

## Context

ADR-0003 chose a **single batch written in one transaction** for the whole review, partly because "one transaction by one actor" dissolves the factory↔evaluator and cover-status races. In practice the batch model fails the reviewer:

1. **Lost work.** An evaluator works through dozens of Answers holding the entire verdict set client-side; a dropped connection, expired session, or closed tab loses the whole batch — nothing was persisted.
2. **No resume.** There is no server-side state for "review in progress." A reviewer cannot stop mid-Cover and resume later.

Concurrency was explicitly *not* a driver — we are not introducing concurrent writers, so ADR-0003's single-finalizer race-freedom still holds.

## Decision

Split the single batch into **two phases**: a per-Answer **save** and a separate, whole-Cover **finalize**.

- **Save (per-Answer).** `POST …/covers/:coverId/answers/:answerId/verdict` with a single verdict entry (`approve` | `change-score` | `reject`). Appends exactly one `answerLogs` row and returns the Answer's new status. Available to tier-1 **and** ODPC/admin. It has **no side effects beyond the log insert** — no file I/O, no Cover transition, no email. The save *is* the verdict (no draft state; `recommended` already carries the provisional semantics).

- **Finalize (whole-Cover, atomic, ODPC/admin only).** `POST …/covers/:coverId/finalize` with an empty body. Reads the already-persisted latest `answerLogs`, then in one transaction: converts every un-overridden `recommended` → `finished`, deletes MinIO files for hard-rejected Answers (outside the txn, before it — per the file-I/O pattern), writes the single `coverLogs` transition, computes the [[Grade]], and emails the Factory. Tier-1 callers get 403.

- **Only finalize writes `finished`.** No save path writes `finished` — not even an ODPC `approve`, which now writes `recommended` during the save phase (like tier-1) and is promoted to `finished` at finalize. This turns ADR-0004's rule ("only ODPC's commit writes `finished`") into a literal code-level guarantee and keeps ODPC's own saves revocable until it commits.

- **Finalize hard-gates on `in_review`.** A finalize is rejected as invalid if any Answer is still `in_review` (nobody rendered a verdict). Finalize never invents a verdict; ODPC resolves leftover `in_review` Answers via individual saves *before* finalizing. This preserves the invariant that every terminal verdict was explicitly authored (traceable via `eval_id`).

- **File deletion stays deferred to finalize.** A hard-reject save never touches MinIO. Deletion happens only at finalize, only for Answers whose *final* persisted status is hard-reject (`verdict_choice` null) — because a tier-1 reject is only a recommendation ODPC may flip, and even ODPC's own reject is revocable until it commits.

- **Edit guard, keyed off authorship.** Because editing in place is now the primary interaction, the write guard is: `finished` → nobody; `recommended` → its author (`answerLogs.eval_id`) or ODPC; `rejected`/`in_review` → any category-scoped reviewer. A tier-1 may re-edit its own verdicts while the Cover is `in_review` (matching `CONTEXT.md`'s Evaluator rule); the authorship key protects a **Factory-accepted** `recommended` (a Negotiation-Loop settlement, not authored by a tier-1) from being silently re-opened by a tier-1.

- **`VerdictBatch` is removed** (and its "duplicate answerId in batch" 400 with it); the single `VerdictEntry` schema is reused as the save body. Both review surfaces — `evaluators/covers/*` and `admins/covers/*` (DOED admin reviewing as national ODPC) — get the same save + finalize split.

## Considered options

- **Keep the batch, autosave client-side (rejected).** Leaves durability a frontend concern; a lost session still loses everything server-side, and "resume" has no server state to resume from. Does not address the driver.
- **Per-answer save, finalize *also* per-answer (rejected).** Folding the Cover transition into "the last answer saved" makes finalization ambiguous (which save is the last?) and loses the atomic whole-Cover gate, backstop, grade, and single email.
- **Per-answer save + separate atomic finalize (chosen).** Durability and resume for the review phase; finalize stays the one atomic, side-effecting, whole-Cover operation.

## Reasons

- **Serves the driver directly** — every verdict is persisted the moment it is made, so review work survives disconnects and is resumable.
- **Preserves every ADR-0003/0004 invariant** — single finalizer, ODPC-only Cover transition, four-value `answerStatus`, deferred file deletion, one email per finalize. End state of a Cover is identical to the batch model.
- **Strengthens an invariant** — "only finalize writes `finished`" is now enforced by the code paths themselves, not just by convention.
- **No schema change** — `answerLogs` was already append-only per-Answer; the latest row per `answerId` is the current state. This change is purely about API granularity and where the Cover transition lives.

## Consequences

- **A review is now N transactions instead of one.** A half-done review is a safe, representable state (some Answers still `in_review`) — and the finalize gate already refuses to commit while any `in_review` remains, so "partial" never corrupts anything.
- **More write requests and more `answerLogs` rows** (one per save/edit rather than one batch). Acceptable given the append-only, event-sourced log.
- **Finalize reads a snapshot that may include very recent tier-1 saves.** Since the Cover is `in_review` throughout review and only ODPC transitions it, a tier-1 save landing just before finalize is simply reflected in finalize's fresh read (converted or bounced as appropriate) — benign, no race.
- **Reverting a saved verdict back to `in_review` ("un-verdict") is out of scope.** A reviewer changes their mind by re-saving a different decision, which the edit guard permits.
- **The code guard at `evaluator-review.ts` must be reworked** from a blanket "recommended + non-ODPC → 403" to the authorship-keyed rule above; the batch-only "duplicate answerId" check is removed.
