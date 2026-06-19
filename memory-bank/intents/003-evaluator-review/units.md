---
intent: 003-evaluator-review
phase: inception
created: 2026-06-17T00:00:00Z
---

# Units: Evaluator Review (Hierarchical ODPC-Gated Cover Review)

## Project Type: backend-api
Decomposition: domain-driven. Single unit within a new **evaluation/review** domain that extends the existing Cover/Answer/AnswerLog model. No frontend unit. Internal sequencing handled by the bolt plan.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-evaluator-review` | Level-aware verdict flow: schema (`verdict_choice`, `recommended`), GET answers + POST verdict endpoints, tier-1/ODPC rules, negotiation loop + factory actions, ODPC finalize + file deletion, Grade, and the verdict-result email | FR-1 to FR-10 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Level-aware answer list (read) → `001-evaluator-review`
- **FR-2** Level-aware batch verdict (write) → `001-evaluator-review`
- **FR-3** Three verdict outcomes (level-dependent status) → `001-evaluator-review`
- **FR-4** Verdict Score (schema + live-choice semantics) → `001-evaluator-review`
- **FR-5** Tier-1 non-finalizing; ODPC finalizes & overrides → `001-evaluator-review`
- **FR-6** Negotiation (consensus) loop → `001-evaluator-review`
- **FR-7** File handling on send-back & re-answer → `001-evaluator-review`
- **FR-8** Re-submission gate (factory) → `001-evaluator-review`
- **FR-9** Grade on finalize + Score Report retrieval → `001-evaluator-review`
- **FR-10** Factory email on every ODPC commit → `001-evaluator-review`

## Dependency Graph

    001-evaluator-review
      ├── extends: Answer/AnswerLog/Cover/CoverLog model + schema (adds verdict_choice, recommended)
      ├── extends: score-service (001) — Score Report gains `grade`; live-choice scoring
      ├── reuses: MinIO utilities (uploadFile/deleteFile), fiscal-year + region scoping
      └── reuses: BullMQ `email` queue/worker (new verdict-result job + templates)

No cross-intent unit is modified destructively — the score-service extension is additive (`grade` field + live-choice input).

## Why one unit

The verdict service, the level-aware endpoints, the negotiation/factory actions, and the ODPC finalize all operate on the **same** `answers`/`answerLogs`/`coverLogs` aggregate inside one atomic transaction and share the level→category map and the `getEvaluatorData` helper. Splitting them would fragment a single transactional concern and force premature interface seams. Grade and email are triggered *by* the finalize commit, so they belong to the same unit; the bolt plan sequences them after the core write path.
