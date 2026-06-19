---
intent: 004-admin-as-evaluator
phase: inception
status: complete
created: 2026-06-18T00:00:00Z
updated: 2026-06-19T00:00:00Z
---

# Requirements: Admin-as-Evaluator (DOED acts at ODPC level)

## Intent Overview

Grant the **DOED admin** role the ability to participate in the existing hierarchical
cover-review flow (intent `003-evaluator-review`) **as if it were an ODPC-level
Evaluator, acting nationally**. Admins live in `adminsDoed` (no `region`, no `level`),
so the review service — which today resolves the reviewer via
`evaluatorService.helper.getEvaluatorData` against the `evaluators` table and gates
every Cover through `assertCoverInRegion` — must instead accept a **synthesized
reviewer context** for an admin: `level = ODPC`, **category ownership = all 5**, and
**no region filter** (cross-region). All downstream ODPC behaviour (override of any
non-`finished` Answer, backstop of un-judged Answers, single-shot finalize, Cover
transition, Grade, and verdict-result email) is reused unchanged from ADR-0003 /
ADR-0004.

The feature is exposed on a **new `/twhp/api/admin/covers/*` surface under
`adminGuard`**, mirroring the evaluator endpoints. Admin powers are **exactly equal to
ODPC** (no superset), and admin actions are audited through the **existing**
`answerLogs.evaluation_id` / `coverLogs.evaluator_id` integer columns (no FK, no schema
change).

Authoritative design for the underlying flow: `CONTEXT.md`, **ADR-0003** (hierarchical
ODPC-gated review), **ADR-0004** (verdict-score consensus loop). This intent **adds no
new review semantics** — it only opens an admin entry point into them.

## Business Goals

| Goal | Success Metric | Priority |
|------|---------------|----------|
| Admin can review any Cover with ODPC powers | Admin lists answers, batch-verdicts, and finalizes a Cover in any region | Must |
| Admin reuses the ODPC code path, not a parallel flow | No duplicated finalize/override/backstop logic; behaviour identical to a regional ODPC | Must |
| Admin operates nationally (cross-region) | Admin reaches Covers regardless of `provinces.health_region`; no region 404 for valid Covers | Must |
| Admin actions are auditable | Every admin verdict row + cover transition records the admin's `accountId` | Must |
| No schema migration required | Audit reuses existing non-FK integer columns; no new column/enum | Should |

---

## Functional Requirements

### FR-1: Synthesized admin reviewer context
- **Description**: When a DOED admin enters the review flow, the service operates on a
  reviewer context of `{ accountId: <admin account id>, level: "ODPC", region: null }`
  instead of resolving the caller through `getEvaluatorData` (which only matches the
  `evaluators` table and would `404 "invalid evaluator"` for an admin).
- **Acceptance Criteria**:
  - An admin caller is **never** rejected with `404 invalid evaluator`.
  - The synthesized context yields ODPC category ownership (`categoriesFor("ODPC")` =
    all 5 categories) for both read and write.
  - The existing evaluator endpoints/behaviour are **unchanged** — the admin path is a
    distinct entry that produces the same reviewer-context shape the service consumes.
- **Priority**: Must

### FR-2: National (cross-region) Cover access
- **Description**: A `region = null` (admin) context bypasses the region gate. The
  region-scoped `assertCoverInRegion(coverId, region)` is replaced, for the admin, by a
  region-less existence check (`assertCoverExists(coverId)`).
- **Acceptance Criteria**:
  - Admin can list/verdict a Cover in **any** `provinces.health_region`.
  - A genuinely non-existent `coverId` still returns `404 { message: "cover not found" }`.
  - Region scoping for **real evaluators is unchanged** (a non-null region still filters
    via `assertCoverInRegion`).
- **Priority**: Must

### FR-3: Admin answer-list endpoint (read)
- **Description**: `GET /twhp/api/admin/covers/:coverId/answers` returns the same
  `AnswerView` shape as the evaluator endpoint, scoped to ODPC ownership (all 5
  categories) with no region filter.
- **Acceptance Criteria**:
  - Route lives under `adminGuard` (`Role.DOED`).
  - Response schema is reused verbatim from `src/schema/evaluator-review.ts`
    (`AnswerViewSchema`): per-Answer `status`, `category`, factory `selectedChoice`,
    latest `verdictChoice` + `description`.
  - Returns every Answer on the Cover (all categories), since ODPC owns all 5.
- **Priority**: Must

### FR-4: Admin batch-verdict endpoint (write) — full ODPC commit
- **Description**: `POST /twhp/api/admin/covers/:coverId/verdict` accepts the same
  `VerdictBatch` body and drives the **ODPC finalize path** exactly: override of any
  non-`finished` Answer on any category, backstop of un-judged `recommended` Answers,
  finalize gate, hard-reject file deletion (outside txn), Cover transition, Grade, and
  verdict-result email.
- **Acceptance Criteria**:
  - Route lives under `adminGuard` (`Role.DOED`); body = `VerdictBatchSchema`.
  - Out-of-scope guard cannot trigger for admin (owns all 5 categories), but the other
    003 validations still apply: duplicate `answerId` → `400`; unknown answer in Cover →
    `400`; `change_score` requires `verdictChoice` (`0–3`) + `description`; `reject`
    requires `description` (enforced by the TypeBox union).
  - **approve** → `finished` (ODPC semantics); **change_score** → `rejected` +
    `verdict_choice`, files preserved; **reject** → `rejected`, files deleted at commit.
  - Finalize gate: a commit that leaves any Answer `in_review` (after backstop) is
    rejected with `400 "finalization blocked: unresolved in_review answers remain"`.
  - On commit: `coverLogs` transition written (`finished` if none rejected, else
    `in_progress`), Grade computed for `finished`, verdict-result email enqueued.
  - Response schema reuses the evaluator verdict response (`message`, optional nullable
    `grade`, plus `400/403/404`).
- **Priority**: Must

### FR-5: Exact ODPC parity — no superset
- **Description**: Admin authority equals a regional ODPC's, no more.
- **Acceptance Criteria**:
  - A `finished` Answer is **immutable to the admin** too — a batch touching one →
    `400 "answer N is already finalized"`.
  - Admin has the **single-shot** commit only (no draft/partial save); the finalize gate
    applies identically.
  - Admin gets **no** extra escape hatch: cannot override `finished`, and gains no
    special behaviour when a region happens to lack an ODPC evaluator (out of scope).
- **Priority**: Must

### FR-6: Audit attribution (no schema change)
- **Description**: Admin actions are attributed via the existing audit columns.
- **Acceptance Criteria**:
  - Every admin verdict row writes the admin's `accountId` to
    `answerLogs.evaluation_id`; the Cover transition writes it to
    `coverLogs.evaluator_id`.
  - These columns are **plain integers with no FK** — writing an admin account id needs
    **no** schema/migration change.
  - **No** actor-type marker is added; an admin action is indistinguishable from an ODPC
    action in the logs (per PO decision).
- **Priority**: Must

### FR-7: Grade + verdict email parity
- **Description**: Admin commit reuses the same Grade computation and BullMQ email jobs
  as an ODPC commit — no new job types or templates.
- **Acceptance Criteria**:
  - finalize-to-`finished` → `verdict-result-finished` (with Grade); bounce-to-
    `in_progress` → `verdict-result-in-progress`.
  - Grade computed on-demand via `calculateBreakdown` + `computeGrade` (ADR-0001: no new
    score endpoint).
  - Email is enqueued only on the admin's commit (same as ODPC), and queue failures are
    swallowed/logged as today.
- **Priority**: Must

### FR-8: Role isolation at the guard
- **Description**: The admin and evaluator surfaces are role-separated by their guards.
- **Acceptance Criteria**:
  - `/admin/covers/*` rejects non-DOED callers with `403` (via `adminGuard` →
    `requireRoles(Role.DOED)`).
  - `/evaluators/covers/*` continues to reject DOED callers with `403` (via `evalGuard`).
  - No shared route accepts both roles.
- **Priority**: Must

---

## Non-Functional Requirements

### Integrity & Concurrency
| Requirement | Target |
|-------------|--------|
| Atomic verdict batch | Admin commit writes all `answerLogs` rows + `coverLogs` transition in **one** DB transaction (reuses 003's txn) |
| File I/O ordering | MinIO hard-reject deletes run **before** the txn, never inside it (reuses 003 pattern) |
| Code reuse | Admin path **must not** duplicate the finalize/override/backstop logic — the ODPC branch is shared via a generalized reviewer context |

### Maintainability
- Preferred seam (construction may refine): generalize the service to take a resolved
  `reviewer` context `{ accountId, level, region: number | null }`; the evaluator route
  resolves it via `getEvaluatorData`, the admin route supplies the synthesized ODPC/
  national context. `region: null` → skip `assertCoverInRegion`.

### Scope & Consistency
- Fiscal-year scoping for Cover/enrollment queries is inherited unchanged from 003.
- No new score endpoint; Grade remains on-demand.

---

## Constraints

### Technical Constraints
**Project-wide standards** loaded by Construction Agent.

**Intent-specific:**
- **No schema change** is required or permitted for this intent: audit reuses the
  existing non-FK `answerLogs.evaluation_id` / `coverLogs.evaluator_id` integers.
- Admin routes must use `adminGuard` (do not hand-compose `jwtPlugin + requireRoles`).
- Response/request DTOs are **reused** from `src/schema/evaluator-review.ts` and
  `src/schema/score.ts` — no parallel schema.
- The ODPC review logic in `src/service/evaluator-review.ts` must be **shared**, not
  copy-pasted, for the admin path.

### Business Constraints
- This intent depends on `003-evaluator-review` being implemented (it reuses its
  service, schema, enums, and email jobs). It must not be constructed before 003.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| An admin and the region's ODPC are not expected to commit the **same** Cover concurrently | Two finalizers on one Cover (003's race-freedom assumed a single finalizer per region) | Accepted, low-risk: both are single-shot; `finished` Answers are sticky/immutable, so a second commit on an already-`finished` Cover hits the "already finalized"/finalize-gate guards. Last-commit-wins; no locking in v1 — future ADR if contention appears. |
| `getEvaluatorData`-style lookups are the only place that assumes the reviewer is in `evaluators` | An admin path could hit a hidden evaluator-table assumption elsewhere | Construction audits `evaluator-review.ts` for any other `evaluators`-table coupling beyond `getEvaluatorData` + `assertCoverInRegion`. |
| DOED admin identity is the `accounts.id` carried in `jwtPayload.sub` | Wrong id audited | Same `Number(jwtPayload.sub)` convention as the evaluator routes. |

---

## Open Questions

_None outstanding._ All four Checkpoint-1 forks resolved by PO:
region = **national/all**, surface = **new `/admin/covers/*`**, powers = **exactly equal
to ODPC**, audit = **no actor distinction**.
