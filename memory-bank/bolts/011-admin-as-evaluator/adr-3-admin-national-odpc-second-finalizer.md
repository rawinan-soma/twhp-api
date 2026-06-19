---
bolt: 011-admin-as-evaluator
created: 2026-06-19T01:40:07Z
status: accepted
superseded_by:
---

# ADR-3: National Admin (DOED) as a Second ODPC-Level Finalizer — Unlocked

## Context

Intent 004 lets a DOED admin act in the cover-review flow as an ODPC-level Evaluator,
**nationally** (`adminsDoed` has no `region`). ADR-0003 (hierarchical ODPC-gated review)
established **race-freedom by single-finalizer**: only the region's ODPC writes the
`coverLogs` transition, and the Factory never holds a Cover while an Evaluator acts — so no
locking apparatus is needed.

Introducing a national admin means a Cover can now have **two** entities able to finalize
it: the region's assigned ODPC evaluator and any DOED admin. This bolt (011) only adds the
seam + the read endpoint, but the seam is what makes the second finalizer possible, so the
decision belongs here.

The implementation reuses ADR-0003's exact ODPC commit path; it does not weaken any
per-Answer invariant (`finished` answers stay sticky/immutable; the finalize gate still
rejects a commit leaving anything `in_review`).

This bolt also makes a smaller, non-ADR-worthy choice — generalizing reviewer resolution
behind a `ReviewerContext` value object — which is a routine refactor consistent with the
existing service pattern and needs no ADR.

## Decision

Allow the national admin to finalize any Cover with full ODPC parity, and **do not add any
locking, region-claim, or admin-vs-ODPC arbitration** in v1. The two-finalizer window is
left open and unguarded, relying on the existing per-Answer invariants as the safety net.

## Rationale

The per-Answer state machine already makes a double-finalize benign:

- A `finished` Answer is immutable to everyone (admin included) → a second commit targeting
  it returns `400 "answer N is already finalized"`.
- The finalize gate requires that, after the batch, no Answer is `in_review`/`recommended`
  → a second commit on an already-`finished` Cover has nothing actionable.
- The transition is computed from aggregate Answer states, so the worst case is a redundant
  `coverLogs` row with the same resulting status (last-commit-wins), not a corrupt state.

Adding locking or a region-claim protocol would reintroduce the very apparatus ADR-0003
deliberately avoided, for an event the PO considers rare (admin and the region ODPC working
the same Cover at the same second). Not worth the complexity in v1.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Pessimistic lock / row-claim on the Cover during review | Eliminates the two-finalizer window | Reintroduces locking ADR-0003 removed; added complexity + failure modes | Disproportionate to a rare event; per-Answer invariants already prevent corruption |
| Admin cannot finalize a region that has an assigned ODPC (read/override only) | Preserves single-finalizer | Defeats the feature's purpose (admin must be able to finalize nationally); PO chose exact parity | Contradicts the approved requirement (powers = exactly equal to ODPC) |
| Add an admin-vs-ODPC precedence rule | Deterministic conflict outcome | New domain rule + audit semantics; still needs detection | Over-engineered; no observed need |
| Distinguish admin commits in audit to ease post-hoc conflict analysis | Better forensics | PO explicitly chose no actor distinction; would need schema change | Out of scope per Checkpoint-1 decision |

## Consequences

### Positive

- Zero new concurrency machinery; ADR-0003's lock-free model preserved.
- Admin path reuses the ODPC commit verbatim — no divergent finalize semantics to maintain.
- No schema change.

### Negative

- A redundant `coverLogs` transition row is possible if admin and ODPC commit the same
  Cover near-simultaneously (cosmetic; status is idempotent on aggregate state).
- Admin and ODPC actions are indistinguishable in logs (per Checkpoint-1 decision), so a
  conflict cannot be attributed after the fact.

### Risks

- **Near-simultaneous double commit**: second commit either no-ops via the finalize
  gate/`already finalized` guard or writes an idempotent transition. Mitigated by the
  per-Answer invariants; no data corruption path identified. Revisit with a future ADR only
  if real contention appears.

## Related

- **Stories**: 001-reviewer-context-seam (the seam enabling a second finalizer), 003-admin-verdict-endpoint (bolt 012, exercises the commit)
- **Standards**: —
- **Previous ADRs**: docs/adr/0003 (hierarchical ODPC-gated review — single-finalizer model this amends), docs/adr/0004 (verdict-score consensus loop)
