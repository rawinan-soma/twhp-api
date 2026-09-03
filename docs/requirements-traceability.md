# Requirements Traceability — Evaluation Module

> Thai version: [การสอบทวนข้อกำหนด — โมดูลการประเมิน](./requirements-traceability-th.md)
> Paired report: [Test Report — Evaluation Module](./test-report.md)

| Field | Value |
|---|---|
| Document ID | `TWHP-RTM-EVAL-001` |
| Scope | Evaluation module — 6 intents, 37 functional requirements |
| Report date | 2026-08-17 |
| Requirement source | `memory-bank/intents/*/requirements.md` (intents 003–011; this matrix's scope) |
| Test evidence source | [`test-report.md`](./test-report.md) §5–§6 |
| Status | Compiled — no suite executed; recorded results carry their original dates |

> **2026-09-03 scope note.** This matrix covers intents 003–011 only, compiled 2026-08-17. It does **not** include intent 012 (list pagination, `memory-bank/intents/012-list-pagination/`) or the six tickets that shipped 2026-09-03 — provincial read-only review (`.scratch/provincial-read-only-review/`) and evaluator detail region scope (`.scratch/evaluator-detail-scope/`). Before those six tickets, the project's requirement-tracking process moved from memory-bank intents to `.scratch/<feature-slug>/PRD.md` plus `issues/NN-*.md` (each carrying a `Status:` triage line) — the mattpocock skills workflow. Memory-bank remains the historical requirement source for the intents already covered here; it is not extended for new work. This note is a scope flag, not a re-audit: the tables below are unchanged from 2026-08-17.

---

## 1. How to Read This Document

Requirement IDs are `<intent>-FR-<n>`, matching the headings in each intent's `requirements.md`. Every functional requirement in the Evaluation module appears exactly once, with one of five verdicts:

| Verdict | Meaning |
|---|---|
| **Verified** | An executable test asserts it, and a passing run is on record |
| **Not yet run** | A test exists in the working tree but has never been executed |
| **Static only** | Verified by code review against acceptance criteria; no executable test |
| **Superseded** | Retired by a later intent; the behaviour it described no longer exists |
| **Uncovered** | No verification at any level |

"Recorded result" cites the bolt and date from the test report; it is not a claim about today.

## 2. Requirement Sources

The Evaluation module accumulated its requirements across six intents. Each later intent amends rather than restates the earlier ones, so the module's *current* contract is the union of the active rows in §4 — not any single requirements file.

| Intent | Title | FRs | Contribution |
|---|---|---:|---|
| `003-evaluator-review` | Hierarchical ODPC-gated Cover review | 10 | The founding domain model: level-scoped review, ODPC as sole finalizer, verdict score, negotiation loop, Grade, email |
| `004-admin-as-evaluator` | DOED admin reviews as national ODPC | 6 | A second entry point into the same flow, region-less, with audit attribution |
| `008-per-answer-verdict-save` | Two-phase review | 9 | Replaces the atomic batch with per-Answer save + separate ODPC finalize; establishes FR-5 ("only finalize writes `finished`") |
| `009-review-standard-files` | Standard files in the cover-review read | 4 | Enriches the read with the factory's claimed-and-uploaded certificates |
| `010-change-score-file-deletion` | Widened deletion predicate | 3 | `change_score` now deletes evidence at finalize, like a hard reject |
| `011-finished-cover-reward-guard` | Finished-only Grade | 5 | Makes "Grade only when the latest CoverLog is `finished`" an explicit, tested contract |

Governing decisions: ADR-0001 (score on demand), ADR-0002 (email-worker scope), ADR-0003 (hierarchical ODPC-gated review), ADR-0004 (verdict-score consensus loop), ADR-0005 (per-answer save + separate finalize), ADR-0006 (widened deletion, superseding ADR-0005's preservation clause).

## 3. Requirement Summary by Intent

**003 — Evaluator Review.** Reviewers see and act only on the categories their level owns (Mental → Mental; DOH → Disease + Safety; ODPC → all five), enforced as a server-side filter, not a UI hint. Covers are region-scoped. A verdict is one of three outcomes: approve, change-score (propose a corrected score, mandatory description), or hard reject (mandatory description). Tier-1 reviewers are non-finalizing; ODPC alone transitions the Cover, may override any non-`finished` Answer, and backstops what tier-1 left unjudged. A `finished` Answer is immutable to everyone. A change-score opens an unbounded negotiation the Factory may accept or object to. On finalize the Cover becomes `finished` (with a Grade) or bounces to `in_progress`; either way the Factory is emailed.

**004 — Admin as Evaluator.** A DOED admin enters the same flow with a synthesized context of `{level: "ODPC", region: null}`, reaching Covers in any region while gaining no authority a regional ODPC lacks. Actions are attributed through the existing non-FK audit columns; no schema change.

**008 — Per-Answer Verdict Save.** The batch write is replaced by durable per-Answer saves plus a separate, ODPC-only, whole-Cover finalize. The critical invariant is FR-5: no save path writes `finished` — even an ODPC approve writes `recommended`, and only finalize promotes it. An authorship-keyed guard governs edits. File deletion moves to finalize.

**009 — Standard Files.** The cover-review read returns `{ answers, standards }`, where `standards` lists only the standards the factory both claimed and uploaded. Standards are factory-level: a tier-1 reviewer with category-filtered answers still sees all of them.

**010 — Change-Score File Deletion.** The finalize deletion predicate widens from "rejected with null verdict choice" to "rejected", so a change-score's evidence is deleted too. Cover-status and Grade semantics are untouched.

**011 — Finished-Cover Reward Guard.** Grade is returned only when the Cover's latest `CoverLog` — greatest serial `id`, not timestamp — is `finished`, consistently across the factory report, all staff list surfaces, the finalize response, and the result emails.

## 4. Traceability Matrix

### 4.1 Intent 003 — Evaluator Review

| ID | Requirement | Verdict | Test evidence | Recorded result |
|---|---|---|---|---|
| 003-FR-1 | Level-aware Answer list: hard server-side category filter + region scope | **Verified** | `evaluator-review.integration` — category-filter case, wrong-region 404; enriched by 009 | 50/50, bolt 022, 2026-07-03 |
| 003-FR-2 | Level-aware **batch** verdict, atomic, 403 on any out-of-scope entry | **Superseded** | Static AC review only (bolt 007); route removed in bolt 021, HTTP probe returns 404 | Retired — replaced by 008-FR-1 / 008-FR-8 |
| 003-FR-3 | Three verdict outcomes; `answerStatus` gains `recommended` | **Verified** (amended) | `save` — approve/change_score/reject outcome cases | 19/19, bolt 019, 2026-07-02 |
| 003-FR-4 | Verdict Score column + live-choice semantics; never overwrite `selectedChoice` | **Verified** (partial) | `save` — `verdict_choice` written on change_score, 0–3 union bars `n/a`; `answer.integration` — latest-log enrichment. The "accepted verdict becomes live" leg runs through `negotiate` — static only | 19/19 + 3/3, bolts 019 / 023 |
| 003-FR-5 | Tier-1 non-finalizing; ODPC finalizes and overrides; `finished` immutable | **Verified** (amended by 008-FR-2) | `save` — immutability 400, ODPC override 200; `verdict` — tier-1 403, promotion, backstop | 16/16, bolt 023, 2026-07-07 |
| 003-FR-6 | Negotiation loop — Factory accept / object, unbounded | **Static only** | Bolt 009 code review, 5 ACs + 1 edge case | No executable test — see G-2 |
| 003-FR-7 | File handling: change-score preserves, hard reject deletes, I/O outside the txn | **Verified** (amended by 010-FR-1) | `verdict` — deletion case, MinIO-failure abort case | 16/16, bolt 023. Redo-side file reconcile is static only |
| 003-FR-8 | Re-submission gate: blocked while any Answer is `rejected` | **Static only** | Bolt 009 code review, 4 ACs + 1 edge case | No executable test — see G-2 |
| 003-FR-9 | Grade on finalize: gold / silver / certificate / joined, strict top-down | **Verified** (partial) | `score.test.ts` — thresholds and boundaries; `verdict` — finalize returns *a* Grade | 24/24 isolated, 2026-07-15. Finalize asserts enum membership only — see G-3 |
| 003-FR-10 | Factory email on every ODPC commit; none for tier-1 or re-submit | **Verified** | `verdict` — one `verdict-result-finished`, one `verdict-result-in-progress`, payload asserted; `save` — no email on save | 16/16, bolt 023 |

### 4.2 Intent 004 — Admin as Evaluator

| ID | Requirement | Verdict | Test evidence | Recorded result |
|---|---|---|---|---|
| 004-FR-1 | Synthesized admin reviewer context `{ODPC, region: null}`; never 404 "invalid evaluator" | **Verified** | `evaluator-review.integration` — `adminReviewerContext` unit case | 10/10, bolt 011, 2026-06-19 |
| 004-FR-2 | National cross-region access via existence-only check; evaluator region gate unchanged | **Verified** | `evaluator-review.integration` — region-null non-existent 404, wrong-region evaluator 404 | 10/10, bolt 011 |
| 004-FR-3 | Admin answer-list endpoint under `adminGuard`, all 5 categories, reused schema | **Verified** at service level | `evaluator-review.integration` — admin read + `Value.Check(AnswerViewSchema)`; `standards` — admin parity | 50/50, bolt 022. Guard itself uncovered — D-01 |
| 004-FR-4 | Admin **batch**-verdict endpoint driving the full ODPC commit | **Superseded** | Bolt 012 asserted it (6/6); the batch route was removed in bolt 021 and that suite replaced | Retired — replaced by 008-FR-7 |
| 004-FR-5 | Exact ODPC parity, no superset: `finished` immutable to admin, no escape hatch | **Verified** | `save` — immutability 400 for all levels; `verdict` — admin finalize follows the same gates | 16/16, bolt 023 |
| 004-FR-6 | Audit attribution: admin `accountId` into `answerLogs.eval_id` + `coverLogs.evaluatorId` | **Verified** (partial) | `verdict` — promotion logs authored by the finalizer (`eval_id`). Admin-specific `coverLogs.evaluatorId` assertion was lost when bolt 021 replaced the bolt-012 suite | Bolt 012 6/6 (2026-06-19), then superseded — **see G-1** |

### 4.3 Intent 008 — Per-Answer Verdict Save

| ID | Requirement | Verdict | Test evidence | Recorded result |
|---|---|---|---|---|
| 008-FR-1 | Per-Answer save endpoint; `answerId` as path param; one log row; no side effects | **Verified** | `save` — decision cases, no-op 400, out-of-scope 403, not-in-cover 400, wrong-region 404, no-side-effect case | 19/19, bolt 019, 2026-07-02 |
| 008-FR-2 | Save writes resolved status; approve → `recommended` for **every** level | **Verified** | `save` — tier-1 approve → recommended, **ODPC approve → recommended** | 19/19, bolt 019 |
| 008-FR-3 | Authorship-keyed edit guard: `finished` none, `recommended` author-or-ODPC, else scoped | **Verified** | `save` — 5 guard cases covering all four branches | 19/19, bolt 019 |
| 008-FR-4 | ODPC-only finalize: hard gate, promotion, deletion, transition, Grade, email | **Verified** | `verdict` — 16 cases across authorization, gate, promotion, both outcomes, deletion, atomicity | 16/16, bolt 023, 2026-07-07 |
| 008-FR-5 | `finished` written exclusively by finalize | **Verified** | `save` — ODPC approve never `finished`; `verdict` — FR-5 case pair | 16/16, bolt 023 |
| 008-FR-6 | File deletion deferred to finalize; save performs zero MinIO I/O | **Verified** (amended by 010-FR-1) | `save` — no side effects; `verdict` — deletion computed from the final snapshot, override-before-finalize keeps the file | 16/16, bolt 023 |
| 008-FR-7 | Both surfaces share save + finalize; admin resolves via `adminReviewerContext` | **Verified** at service level | `verdict` — admin finalize case; bolt 021 HTTP probes confirm both surfaces registered | 44/44, bolt 021, 2026-07-02 |
| 008-FR-8 | Batch endpoint and `VerdictBatchSchema` removed on both surfaces | **Verified** | Bolt 021 HTTP probes — both batch routes return 404; no test references `VerdictBatchSchema`; `API.md` has 0 references | Bolt 021, 2026-07-02 |
| 008-FR-9 | Answer list unchanged; remains the resume source | **Verified** | `evaluator-review.integration` — `getAnswers` regression (filtering, projection, scope) | 50/50, bolt 022 |

### 4.4 Intent 009 — Review Standard Files

| ID | Requirement | Verdict | Test evidence | Recorded result |
|---|---|---|---|---|
| 009-FR-1 | Standards surfaced as `{ standard, fileName }`, claimed **and** uploaded only | **Verified** | `standards` — claimed-no-file excluded, not-claimed-with-file excluded, both claimed present | 50/50, bolt 022, 2026-07-03 |
| 009-FR-2 | Response shape becomes `{ answers, standards }`; answers unchanged | **Verified** | `standards` — shape case; `evaluator-review.integration` — updated regression | 50/50, bolt 022 |
| 009-FR-3 | Both surfaces identical; standards are factory-level, not category-scoped | **Verified** | `standards` — tier-1 sees all standards, admin equals regional ODPC, wrong-region 404 leaks nothing | 50/50, bolt 022 |
| 009-FR-4 | Read-only from the enroll; no schema change; no N+1 | **Verified** (partial) | `standards` — empty-answers cover still returns standards. "No N+1" is a structural claim from `STANDARD_ENROLL_COLUMNS`, asserted by review — see G-4 | 50/50, bolt 022 |

### 4.5 Intent 010 — Change-Score File Deletion

| ID | Requirement | Verdict | Test evidence | Recorded result |
|---|---|---|---|---|
| 010-FR-1 | Deletion predicate widened from hard-reject-only to any final `rejected` | **Verified** | `verdict` — change-score and hard-reject both deleted, recommended preserved, override-before-finalize keeps its file | 16/16, bolt 023, 2026-07-07 |
| 010-FR-2 | Cover-status and Grade computation unchanged | **Verified** | `verdict` — ≥1 rejected → `in_progress` + null Grade; all recommended → `finished` + Grade | 16/16, bolt 023 |
| 010-FR-3 | Both surfaces stay in parity; no per-surface branching | **Verified** | `verdict` — admin finalize case, unchanged and passing | 16/16, bolt 023 |

### 4.6 Intent 011 — Finished-Cover Reward Guard

| ID | Requirement | Verdict | Test evidence | Recorded result |
|---|---|---|---|---|
| 011-FR-1 | Latest `CoverLog` by greatest serial `id` is the Grade authority; timestamps ignored | **Not yet run** | `score.integration` — intent-011 case deliberately inverts timestamps to prove ID ordering | Uncommitted; no execution on record |
| 011-FR-2 | Score reports return Grade only for finished Covers, across all four surfaces | **Not yet run** | `score.integration` — same case walks factory + region + province + admin through finished → in_review → in_progress | Uncommitted |
| 011-FR-3 | Finalize returns and emails Grade only after a committed `finished` transition | **Not yet run** | `verdict` — admin null-Grade-on-revision case; strengthened Grade assertions on the finished cases | Uncommitted |
| 011-FR-4 | Existing API and scoring contracts unchanged | **Not yet run** | `score.test.ts` — null Grade accepted, all four Grades accepted, `"platinum"` rejected | Uncommitted |
| 011-FR-5 | Finished-only regression coverage exists at service and schema seams | **Not yet run** | The four rows above constitute the coverage this requirement asks for | Uncommitted — bolt 024 has no test report |

## 5. Superseded Requirements

Two requirements describe behaviour that no longer exists. They are retained here so that reading an old requirements file does not imply a coverage gap.

| ID | Superseded by | What changed |
|---|---|---|
| 003-FR-2 | 008-FR-1, 008-FR-8 | The atomic batch verdict became per-Answer saves. `POST …/covers/:id/verdict` now returns 404 on both surfaces; `VerdictBatchSchema` and the duplicate-`answerId` 400 are gone. |
| 004-FR-4 | 008-FR-7 | The admin batch endpoint became admin save + admin finalize, sharing one service implementation with the evaluator surface. |

One clause was amended rather than retired: **003-FR-3's "ODPC approve → `finished`"** was replaced by **008-FR-2's "approve → `recommended` for every level"**. This is the module's most consequential rule change, and it is the invariant most heavily tested (008-FR-5).

## 6. Coverage Summary

| Verdict | Count | Share |
|---|---:|---:|
| Verified | 28 | 76% |
| Not yet run | 5 | 14% |
| Static only | 2 | 5% |
| Superseded | 2 | 5% |
| Uncovered | 0 | 0% |
| **Total** | **37** | |

Of the 28 verified requirements, six are marked partial: 003-FR-4, 003-FR-7, 003-FR-9, 004-FR-3, 004-FR-6, and 009-FR-4 each have one leg of their acceptance criteria resting on code review rather than an assertion.

No functional requirement is entirely uncovered. Every gap is either a leg of a partially verified requirement or one of the two static-only requirements.

## 7. Gaps Found by This Pairing

The test report's defect list (D-01…D-10) catalogues risks in the *test infrastructure*. The gaps below are specific to *requirement coverage* and were identified by this pairing exercise.

| ID | Requirement | Gap | Related |
|---|---|---|---|
| **G-1** | 004-FR-6 | **Admin audit attribution lost its assertion.** Bolt 012 verified that every `answerLogs.eval_id` and `coverLogs.evaluatorId` equals the admin's `accountId`. Bolt 021 then renamed the bolt-020 finalize suite over `evaluator-review.verdict.integration.test.ts`, replacing that file. The current suite asserts `eval_id` on promotion logs generally, but no test asserts that an **admin** finalize writes the admin's id to `coverLogs.evaluatorId`. This is the module's only requirement whose coverage regressed. | New |
| G-2 | 003-FR-6, 003-FR-8 | Factory negotiation (accept / object / redo) and the re-submit gate remain static-only from bolt 009. Together these are the largest active surface in the evaluation flow with no executable test — and the negotiation loop is what `change_score` exists to drive. | test-report §9 |
| G-3 | 003-FR-9 | Finalize asserts only that the returned Grade is a member of the enum, not that a fixture with known answers produces a specific Grade. The thresholds are proven in isolation; their wiring into finalize is not. | test-report §9 |
| G-4 | 009-FR-4 | The "no N+1" performance clause is a structural property of `STANDARD_ENROLL_COLUMNS`; no test counts queries. | — |
| G-5 | 011-FR-1…FR-5 | The entire intent is written but unexecuted, and bolt 024 has no test report. | D-07 |
| G-6 | 003-FR-4 | "An accepted Verdict Score becomes the live choice" runs through `answer.negotiate`, which has no executable test — so the write half of live-choice semantics is unverified. | G-2 |
| G-7 | 004-FR-3, 008-FR-7 | Both surfaces are verified at the service level; neither route's `adminGuard` rejection path is asserted. | D-01 |

**Priority.** G-1 is the one to close first: it is a regression, it is cheap to restore (one assertion in the existing admin finalize case), and audit attribution is the requirement a reviewer is least likely to notice failing. G-2 is the largest gap by surface area, and G-5 is simply unfinished work.

## 8. Non-Functional Requirements

| Requirement | Source | Verdict | Evidence |
|---|---|---|---|
| Finalize atomicity — promotions + transition in one transaction | 008 NFR | **Verified** | `verdict` — atomicity case |
| File I/O runs outside and before the transaction | 003 NFR, 010 NFR | **Verified** | `verdict` — MinIO-failure abort leaves no partial transition |
| Verdict durability — a save survives disconnect | 008 NFR | **Verified** | `save` — each save is its own transaction; asserted by reading back the log |
| Partial-review safety — a half-reviewed Cover is valid | 008 NFR | **Verified** | `verdict` — hard gate rejects an unresolved Cover |
| Event-sourced state — latest log row wins | 003 NFR, 011 constraint | **Verified** / **Not yet run** | `answer.integration` — enrichment; `score.integration` — explicit ID-vs-timestamp case (uncommitted) |
| Single finalizer — race freedom without locking | 003 NFR | **Uncovered** | No concurrency test exists; the property is argued from design, not asserted — test-report §9 |
| Region and fiscal-year scoping | 003 NFR | **Verified** / **Uncovered** | Region scoping asserted; fiscal-year boundary behaviour untested — test-report §9 |
| Added read cost — no N+1 on standards | 009 NFR | **Static only** | See G-4 |

## 9. Maintenance

This matrix is derived, not authoritative. When a requirement changes:

1. Amend the intent's `requirements.md` — that file remains the source of truth.
2. Add or update the row here, and set the verdict from the test evidence, not from intent.
3. If a bolt renames or replaces a test file, re-check every row citing that file. G-1 exists because a file replacement silently dropped assertions that a requirement depended on.
4. Update the recorded result only after an actual run, citing bolt and date.

Related documents: [Test Report](./test-report.md), [Testing](./testing.md), [Technical debt](./technical-debt.md), [Business rules](./business-rules.md), [Domain model](./domain-model.md), [Thai version of this document](./requirements-traceability-th.md).
