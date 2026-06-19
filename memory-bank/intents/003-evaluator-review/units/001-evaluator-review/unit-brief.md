---
unit: 001-evaluator-review
intent: 003-evaluator-review
phase: inception
status: complete
created: 2026-06-17T00:00:00.000Z
updated: 2026-06-17T00:00:00.000Z
---

# Unit Brief: Evaluator Review (Hierarchical ODPC-Gated Cover Review)

## Purpose

Add the level-aware, hierarchical review flow for a submitted Cover: tier-1 (Mental/DOH) reviewers verdict their own categories (non-finalizing); ODPC overrides, backstops, and is the sole finalizer; evaluators can change-score; the factory accepts/objects/redoes in an unbounded negotiation; ODPC's commit finalizes the Cover, computes the Grade, deletes hard-rejected files, and emails the factory. The sole unit for this intent — extends the existing Cover/Answer model with two additive schema changes.

## Scope

### In Scope

- **Schema** (`schema.ts` + `db:push`): add nullable `answerLogs.verdict_choice` (Choices `0–3`); add `recommended` to the `answerStatus` enum (→ `in_review`/`recommended`/`rejected`/`finished`); add `grade` to the Score Report response schema (computed, not a column).
- **Level→category access**: server-side constant `Mental→{Mental}`, `DOH→{Disease,Safety}`, `ODPC→all 5`; sourced from CONTEXT.md.
- **`GET /twhp/api/evaluators/covers/:coverId/answers`** — region-scoped, hard category-filtered by caller level; returns status, question+category, factory `selectedChoice`, existing `verdict_choice`+`description`.
- **`POST /twhp/api/evaluators/covers/:coverId/verdict`** — single atomic batch; outcomes approve / change_score / reject; out-of-scope → whole-batch `403`; tier-1 approve→`recommended`, ODPC approve→`finished`; ODPC override of any non-`finished`; finalize gate (no `in_review`/`recommended` left); transition `finished`/`in_progress`.
- **Negotiation + factory actions** (existing factory answer endpoints): accept (→`recommended`, same file validator), object/redo (→`in_review`, free file management), re-submit gate (no Answer `rejected`).
- **File lifecycle**: change-score preserves; hard-reject deletes from MinIO at ODPC commit, **outside** the txn.
- **Grade**: 4-tier top-down floors, computed on transition to `finished`, in finalize response + Score Report (`grade`, null unless finished); list endpoints (evaluator/provincial/admin) gain `grade`.
- **Email**: new BullMQ `email` job type(s) + two Thai templates ("complete + Grade" / "revision needed"); enqueued on every ODPC commit via `enrolls.email`.

### Out of Scope

- New score endpoint (ADR-0001) — extend existing only.
- Concurrency-locking apparatus (single-finalizer dissolves races — ADR-0003).
- Escalation / deadline / admin-override for a never-settling negotiation loop (future ADR).
- 2FA / auth changes (intent 002); frontend/UI.
- `n/a`-only Cover or category handling (PO: does not happen).

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Level-aware answer list (read) | Must |
| FR-2 | Level-aware batch verdict (write) | Must |
| FR-3 | Three verdict outcomes (level-dependent status) | Must |
| FR-4 | Verdict Score (schema + live-choice) | Must |
| FR-5 | Tier-1 non-finalizing; ODPC finalizes & overrides | Must |
| FR-6 | Negotiation (consensus) loop | Must |
| FR-7 | File handling on send-back & re-answer | Must |
| FR-8 | Re-submission gate (factory) | Must |
| FR-9 | Grade on finalize + Score Report retrieval | Must |
| FR-10 | Factory email on every ODPC commit | Must |

## Interface (how other code interacts)

- New `evaluatorReviewService` (factory pattern `createEvaluatorReviewService(db)`), or extend `evaluatorService`. Routes under `evalGuard` autoloaded from `src/routes/evaluators/covers/[coverId]/…`.
- Reuses `evaluatorService.helper.getEvaluatorData` (level+region), `utilities()` (uploadFile/deleteFile/getFiscalYear), the `email` queue.
- Extends `scoreService`/Score Report to compute `grade` from live choices.

## Dependencies

- Existing model: `answers`, `answerLogs`, `coverLogs`, `covers`, `enrolls`, `evaluators`.
- Existing units (read/extend): score-service (001) for the Score Report + scoring; email queue/worker; MinIO utilities.
- Schema migration must land before the verdict service (bolt sequencing).

## Key Risks

- **`answerStatus` enum +`recommended`** ripples through every existing status switch (score guard, cover-transition, answer derivations) — audit required.
- File deletes must stay **outside** the DB transaction (data loss / partial-commit risk otherwise).
- Email worker is login-critical (ADR-0002) — new job types widen its surface.
