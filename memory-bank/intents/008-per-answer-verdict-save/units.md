---
intent: 008-per-answer-verdict-save
phase: inception
created: 2026-07-02T00:00:00Z
---

# Units: Per-Answer Verdict Save + Separate ODPC Finalize

## Project Type: backend-api
Decomposition: domain-driven. A single unit that refactors the write path of the existing **evaluation/review** domain (`003-evaluator-review`, unit `001-evaluator-review`). No frontend unit. No schema migration. Internal sequencing handled by the bolt plan.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-per-answer-verdict-save` | Split the batch verdict into a per-Answer save (durable/resumable, authorship-keyed edit guard, approve→`recommended` for all levels) and a separate ODPC-only finalize (hard-gate, `recommended→finished`, deferred file deletion, transition, grade, email); drop `VerdictBatchSchema`; mirror on the admin surface; regen docs | FR-1 to FR-9 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Per-Answer verdict save (write) → `001-per-answer-verdict-save`
- **FR-2** Save = verdict, level-dependent status (no draft) → `001-per-answer-verdict-save`
- **FR-3** Authorship-keyed edit guard → `001-per-answer-verdict-save`
- **FR-4** ODPC finalize (separate whole-Cover action) → `001-per-answer-verdict-save`
- **FR-5** `finished` written exclusively by finalize → `001-per-answer-verdict-save`
- **FR-6** File deletion deferred to finalize → `001-per-answer-verdict-save`
- **FR-7** Both review surfaces (evaluators + admin-as-ODPC) → `001-per-answer-verdict-save`
- **FR-8** Remove batch verdict endpoint + schema → `001-per-answer-verdict-save`
- **FR-9** Answer list unaffected → `001-per-answer-verdict-save`

## Dependency Graph

    001-per-answer-verdict-save
      ├── refactors: 003-evaluator-review / 001-evaluator-review (evaluator-review.ts verdict())
      ├── reuses: answers/answerLogs/coverLogs aggregate (NO schema change)
      ├── reuses: getEvaluatorData (level+region), adminReviewerContext, utilities().deleteFile, email queue, grade/scoreHelpers
      └── mirrors: admins/covers/* route surface (in-flight migration)

No schema is migrated; no other intent is modified destructively. This unit supersedes the batch write path of `003` per ADR-0005.

## Why one unit

The per-Answer save, the authorship-keyed edit guard, and the ODPC finalize all operate on the **same** `answers`/`answerLogs`/`coverLogs` aggregate and share the level→category map, `getEvaluatorData`, and `adminReviewerContext`. Save and finalize are two phases of one transactional concern (finalize reads exactly what save persisted). Splitting them across units would fragment that concern and force premature interface seams; the bolt plan sequences the write path before finalize before routes/surfaces/docs.
