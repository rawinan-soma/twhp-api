---
stage: domain-model
bolt: 009-evaluator-review
created: 2026-06-17T04:15:00Z
---

## Static Model: Factory Negotiation — Accept / Object / Redo + Re-submit Gate (009-evaluator-review)

> Scope: Factory-side actions after an ODPC bounce: accept a changed score, object/redo, then re-submit.
> Stories: 007-factory-accept-object-redo, 008-resubmit-gate.

---

### Entities

- **NegotiationAction**: A single factory action on one answer post-bounce.
  - Variants: `accept` (take the evaluator's changed score) | `redo` (re-answer with own evidence)
  - Business Rules:
    - Cover must be `in_progress` before any negotiation action.
    - Answer must be `rejected` (not `recommended` or `finished` — those are locked).
    - `accept` is only valid when the latest log has `verdictChoice` set (change-score answer).

- **ResubmitRequest**: Factory re-submitting the Cover after addressing all send-backs.
  - Business Rules:
    - Cover must be `in_progress`.
    - No answer may have final status `rejected` at re-submit time.
    - `recommended` and `finished` answers carry over untouched (sticky).

---

### Value Objects

- **AcceptOutcome**: Result of `accept` action:
  - `selectedChoice ← verdictChoice` (evaluator's score becomes the live choice)
  - `answerLogs` row: `status: "recommended"` (immediately promoted, no re-review needed)
  - File validator runs against `verdictChoice` using only existing fileUrls (no new files):
    - Downgrade (e.g., 3→1): existing file_1_1 present → passes
    - Upgrade (e.g., 1→3): file_3_1 missing → **fails → factory must object instead**

- **RedoOutcome**: Result of `redo` (object or redo) action:
  - Factory provides new `selectedChoice` + file uploads/replacements
  - `answerLogs` row: `status: "in_review"` (back to tier-1 review queue)
  - File I/O: MinIO reconcile (delete removed + upload added) before txn
  - Hard-reject redo: all fileUrls were cleared by bolt-008 → factory must re-upload required files
  - Change-score object: existing fileUrls may satisfy new choice → partial re-upload allowed

- **ResubmitGate** — validity predicate:
  - **Valid**: zero answers with status `rejected`
  - **Invalid → 400**: ≥1 answer still `rejected` — return list of outstanding rejected answer IDs

- **CoverResubmitTransition**: `in_progress → in_review` written as a `coverLogs` row (factory as actor, no evaluatorId)

---

### State Machine Additions (answer-level)

| Current status | Action | Next status | Notes |
|----------------|--------|-------------|-------|
| `rejected` (change-score) | `accept` (file validator passes) | `recommended` | Live choice = verdictChoice |
| `rejected` (change-score) | `accept` (file validator fails) | — | 400, must object |
| `rejected` (any) | `redo` | `in_review` | Factory's new selectedChoice + files |
| `recommended` | any | — | 403 locked |
| `finished` | any | — | 403 locked (immutable) |
| `in_review` | negotiate | — | 400 not applicable (not a bounced answer) |

---

### Domain Services

- **NegotiationService** (new method on `answerService`):
  - `negotiate(factoryId, dto)`: dispatches to accept or redo branch
  - `submit` (modified): re-submit gate replaces "all in_review" with "no rejected"

---

### Ubiquitous Language

| Term | Definition |
|------|-----------|
| accept | Factory agrees to the evaluator's changed score → `recommended` without re-review |
| object | Factory re-answers a change-score verdict with its own evidence → `in_review` |
| redo | Factory re-answers a hard-rejected answer from scratch → `in_review` |
| redo/object | Common service path for both object and redo (same semantics, result in `in_review`) |
| re-submit | Factory sends the bounced Cover back for evaluation after addressing all rejections |
| bounced Cover | Cover that transitioned to `in_progress` after ODPC's finalize with ≥1 `rejected` answer |
| upward accept | Accept where verdictChoice > current selectedChoice — requires matching files or must object |
| sticky | `recommended` and `finished` answers are unchanged by re-submit |
