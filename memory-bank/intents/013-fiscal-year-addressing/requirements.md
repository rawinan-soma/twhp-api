---
intent: 013-fiscal-year-addressing
phase: inception
status: complete
created: 2026-08-20T07:58:01Z
updated: 2026-08-20T08:45:00Z
---

# Requirements: Fiscal Year Addressing

## Intent Overview

Fiscal year is an implicit, derived, query-time concept. `utilities().getFiscalYear()`
(`src/utils.ts:54-64`) recomputes the current Oct 1 – Oct 1 window on every request, and all 16 call
sites across `enroll`, `cover`, `answer`, `score`, and `factory` hardcode "now". No caller can
address a year other than the current one, and no write path can touch one.

At 2026-10-01 the window advances and every prior-year row becomes unreachable: Factories receive
`no enrollment found` / 404, staff lists return `meta.total: 0`. Nothing is deleted — it simply
cannot be addressed. Work left unfinished at the boundary cannot be completed by anyone.

This intent makes fiscal year an **addressable read dimension** and a **selectively writable** one,
entirely within the application layer.

**Type**: Enhancement (brown-field — API contract and authorization; no persistence change)

---

## Canonical Definition (normative)

> **Fiscal year `Y` is the half-open interval `[Oct 1 of Y-1 00:00, Oct 1 of Y 00:00)` in
> `Asia/Bangkok`, labelled by its ending Common Era year.**

- FY **2026** runs 2025-10-01 → 2026-09-30 inclusive.
- The API stores nothing and returns **CE**. The frontend renders **BE** as `fiscalYear + 543`
  (FY2026 → พ.ศ. 2569). No BE value crosses the API boundary in either direction.

Off-by-one here mislabels every historical read. Every FR below depends on it.

---

## Hard Constraint: No Database Schema Changes

**Decided 2026-08-20.** This intent adds no columns, no indexes, no constraints, and no enum values.
Fiscal year remains **derived at query time** from `Enrolls.enroll_date`.

Three capabilities are therefore **out of scope and explicitly forgone**:

| Forgone | Consequence accepted |
|---------|----------------------|
| Stored `fiscal_year` column | The BR-06 boundary ambiguity is re-derived on **every** historical read, not resolved once. Mitigated — not eliminated — by FR-1. |
| Unique index on `(factory_id, fiscal_year)` | BR-07 stays application-only. `.limit(1)` owner lookups stay nondeterministic if duplicates exist. |
| Index supporting fiscal-year filters | Fiscal filters remain sequential scans. **This is status quo**: `Enrolls` carries only `enrolls_id_key` on the PK (`src/drizzle/schema.ts:229`) — no `enroll_date` or `factory_id` index exists today. No regression is introduced. |

Because identity is not stored, **the correctness of the derivation itself becomes the contract**.
That is what FR-1 addresses, and why it is the keystone requirement rather than a cleanup.

---

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| No user-visible dark period at the 2026-10-01 rollover | On 2026-10-01, every role's list and detail endpoints return FY2026 data when addressed; no endpoint that worked on Sep 30 returns 404/empty for the same logical resource | Must |
| Unfinished FY2026 work can still be completed after rollover | A Factory at `in_progress` on Oct 1 can submit through the grace window; DOED/ODPC can review and score FY2026 Covers with no expiry | Must |
| Fiscal-year derivation is deterministic and host-independent | One clock read per resolution; identical results regardless of host `TZ` | Must |
| Prior-year history is readable by every role within existing scope | Each role can address any past fiscal year and receives exactly the rows its current-year scope would have granted | Should |

---

## Functional Requirements

### FR-1: Parameterised, deterministic fiscal-year derivation

- **Description**: Extend `utilities().getFiscalYear()` to accept an optional CE fiscal year and
  return that year's window, defaulting to the current one. Resolve boundaries explicitly in
  `Asia/Bangkok` rather than inheriting host local time, and read the clock **once**.
- **Rationale**: With no stored column, every historical read re-derives its boundary. Today's
  implementation reads `new Date()` twice (`src/utils.ts:55-56`) and depends on host `TZ`. Both
  become materially riskier when the derivation runs for arbitrary years, not just the current one.
- **Acceptance Criteria**:
  - `getFiscalYear(2026)` returns `[2025-10-01T00:00 +07, 2026-10-01T00:00 +07)`.
  - `getFiscalYear()` with no argument returns the current fiscal year — behaviour unchanged for all
    16 existing call sites, which continue to compile and pass without edit.
  - Exactly one clock read per resolution; the two-`new Date()` rollover race is removed.
  - Results are identical under `TZ=UTC` and `TZ=Asia/Bangkok`. Deployed containers already set
    `Asia/Bangkok` (`docker-compose.yaml:30`), so this removes a dependency rather than changing
    deployed behaviour.
  - A helper resolves "which fiscal year is a given instant in", used by FR-8 and grace-window logic.
- **Priority**: Must — keystone; every other FR consumes it.
- **Related Stories**: TBD

### FR-2: Fiscal year as an explicit read parameter

- **Description**: Add an optional `fiscalYear` query parameter to fiscal-scoped read endpoints,
  composed alongside `page`/`limit` in the pattern established by `src/schema/pagination.ts:32`.
  Omitting it selects the current fiscal year.
- **Acceptance Criteria**:
  - `t.Numeric` with `multipleOf: 1` — query values arrive as strings; a fractional year must never
    reach the date arithmetic.
  - Applies to: enrollment lists (admin/evaluator/provincial), factory lists, score report lists,
    and Factory self-reads for enrollment, cover, answers, and score.
  - A valid year with no data returns an empty page with `meta.total: 0`, not 404.
  - A malformed year is rejected by validation before any query runs.
  - Omitted parameter produces responses byte-identical to today's.
  - The parameter threads to the service layer as a resolved window from FR-1 — no service
    hand-rolls date boundaries (`CLAUDE.md`).
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Historical reads honour existing role scope

- **Description**: Every role may address any fiscal year, receiving exactly the rows its present
  scope grants. No history-specific authorization model is introduced.
- **Acceptance Criteria**:
  - Factory reads only its own prior-year records; Provincial its province; Evaluator its region;
    DOED nationally.
  - A Factory requesting another Factory's prior-year data is refused exactly as today.
  - Region derivation for historical rows uses the Factory's location as joined from the historical
    enrollment. **Known limitation**: `provinces`/`districts` are joined via `factories`, which holds
    *current* location — so a relocated Factory changes the apparent region of a closed year. Without
    schema change this cannot be fully fixed; it is documented, not silently accepted.
- **Priority**: Must
- **Related Stories**: TBD

### FR-4: Past-fiscal-year write authority

- **Description**: Writes targeting a fiscal year other than the current one are permitted only to
  `Role.DOED` and to `Role.Evaluator` whose `evaluators.level` is `ODPC`. All other roles remain
  current-year-write-only, except as granted by FR-5.
- **Acceptance Criteria**:
  - New level-scoped middleware exists. `evalGuard` (`src/middleware/guards.ts:12`) admits all
    evaluator levels and **cannot** express this rule; the new guard composes `jwtPlugin` +
    `requireRoles` + an `evaluators.level` check.
  - An `Evaluator` at level `Mental` or `DOH` attempting a past-year write is refused.
  - ODPC past-year writes remain **region-scoped**; the existing region restriction is not widened.
  - Refusals return a distinct, logged response, not a generic 404.
  - Authority does not expire — DOED/ODPC can act on a closed year indefinitely.
- **Priority**: Must
- **Related Stories**: TBD

### FR-5: Factory grace window for unfinished prior-year Covers

- **Description**: For a bounded window following rollover, a Factory may continue to advance a
  prior-year Cover that has not reached `finished`, exactly as it could before the boundary.
- **Acceptance Criteria**:
  - The window is a **single declared policy value** resolved in one place, not duplicated across
    services (see Assumptions: 2026-10-01 → 2026-10-31 inclusive).
  - During the window a Factory may save/update answers and submit the Cover
    (`answer.ts:344`, `in_progress → in_review`).
  - Grace applies to **Cover completion only**. Creating a prior-year enrollment, or editing
    prior-year enrollment fields, stays refused.
  - A Cover already `finished` is not reopened.
  - After the window closes, Factory writes to that year are refused; FR-4 authority is unaffected.
- **Priority**: Must
- **Related Stories**: TBD

### FR-6: Concurrent open years

- **Description**: During the grace window a Factory legitimately holds two open fiscal years — a
  FY2026 Cover being finished and a new FY2027 enrollment. Every current-year read must resolve
  unambiguously to one of them.
- **Acceptance Criteria**:
  - Self-reads default to the **current** fiscal year; the FY2026 record is reachable only by
    explicit `fiscalYear`.
  - `coverService.create` still refuses a second Cover for the same enrollment; its duplicate check
    keys on `enroll_id` (`src/service/cover.ts:30-33`) and therefore already permits a correct
    new-year Cover. **Confirm by test; do not assume.**
  - No `.limit(1)` self-read returns a row from the wrong year.
- **Priority**: Must
- **Related Stories**: TBD

### FR-7: Grace window expiry disposition

- **Description**: Define what a Cover still `in_progress` at window close becomes.
- **Constraint**: `coverStatus` is a pgEnum of exactly `finished` | `in_progress` | `in_review`
  (`src/drizzle/schema.ts:296`). **A new terminal status such as `expired` is a schema change and is
  therefore unavailable.** The disposition must reuse an existing value or leave the Cover as-is.
- **Acceptance Criteria**:
  - A Cover unfinished at window close remains `in_progress`; no status mutation occurs.
  - No scheduled job, sweep, or migration touches expired Covers — expiry is evaluated at write time
    by comparing the target fiscal year against the grace policy.
  - Such Covers remain readable by every role per FR-3, and remain writable by DOED/ODPC per FR-4.
  - They are excluded from scoring exactly as today: `SCORABLE_STATUSES` is `in_review`/`finished`
    (`src/service/score.ts:26`), so an `in_progress` Cover is already non-scorable. No change needed.
- **Priority**: Should — **unresolved**, see Open Questions.
- **Related Stories**: TBD

### FR-8: Fiscal year surfaced in responses

- **Description**: Read responses for fiscal-scoped resources include the CE fiscal year of the
  record returned, so the frontend renders BE without inferring it from dates.
- **Acceptance Criteria**:
  - Enrollment, cover, score, and list-item responses carry `fiscalYear`.
  - The value is derived in one place via the FR-1 helper from `enroll_date`; no route or client
    recomputes it.
- **Priority**: Should
- **Related Stories**: TBD

---

## Non-Functional Requirements

### Compatibility

| Requirement | Metric | Target |
|-------------|--------|--------|
| Existing callers unaffected | Endpoints whose response changes when `fiscalYear` is omitted | 0 |
| Persistence untouched | Columns, indexes, constraints, or enum values added or altered | 0 |
| Call-site churn | Existing `getFiscalYear()` call sites requiring edit for FR-1 alone | 0 |

### Correctness of derivation

| Requirement | Metric | Target |
|-------------|--------|--------|
| Host-timezone independence | Differing results between `TZ=UTC` and `TZ=Asia/Bangkok` | 0 |
| Clock reads per resolution | `new Date()` calls | 1 |
| Boundary coverage | Tests at Sep 30 23:59:59 and Oct 1 00:00:00 Bangkok, incl. leap years | pass |

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Fiscal-scoped list queries | p95 latency vs. current implementation | no regression (identical predicate shape) |

### Auditability

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Past-year mutations attributable | Actor recorded on every out-of-year write | DOED/ODPC and grace-window Factory writes alike |

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Authorization | RBAC + evaluator level | New level-scoped guard; existing role scoping reused unchanged |
| No scope widening | Historical reads granting a row a role cannot already see for the current year | none |

---

## Constraints

**Project-wide standards**: Loaded from `memory-bank/standards/` by the Construction Agent.

**Intent-specific constraints**:

- **No database schema changes** — see the dedicated section above. Governs FR-3, FR-7, and the
  forgone capabilities.
- `Enrolls.enroll_date` is `timestamp without time zone` (`src/drizzle/schema.ts:152`) and is
  compared against ISO strings. `docs/business-rules.md` BR-06 rates live boundary behaviour
  **Unknown**; FR-1 narrows this to a single, explicitly-declared application-side rule.
- `evaluatorLevels` (`Mental` | `DOH` | `ODPC`) is a column on `Evaluators`, not a `Role`. `Role`
  has exactly four values (`src/service/authentication.ts:27-32`). FR-4 cannot be expressed with
  existing guards.
- `coverStatus` pgEnum is fixed at three values — constrains FR-7.
- `covers.startDate` maps to a DB column literally named `enroll_date` (`src/drizzle/schema.ts:291`).
  Confusing during this work; renaming is out of scope (and would be a schema change).
- File I/O stays outside DB transactions (`CLAUDE.md`, `src/service/answer.ts` pattern) — relevant to
  grace-window answer submission.
- **Delivery**: live before 2026-10-01, ~6 weeks from intent creation.

### Business Constraints

- The 2026-10-01 boundary is externally fixed and cannot be moved.
- Some Factories and evaluators are known to be incomplete for FY2026 as of intent creation — this
  is the originating concern, not a hypothetical.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| ~~Grace window is 31 days~~ — **confirmed at Checkpoint 2**: 2026-10-01 → 2026-10-31 inclusive | n/a — decided | Single declared policy value so the date moves without touching services |
| ~~Grace covers Cover completion only~~ — **confirmed at Checkpoint 2** | n/a — decided | Explicit in FR-5 |
| ~~ODPC stays region-scoped~~ — **confirmed at Checkpoint 2** | n/a — decided | Explicit in FR-4 |
| Frontend owns BE conversion (`+543`) | Off-by-543 or off-by-one-year display | Canonical Definition is normative; no BE crosses the API |
| FY is labelled by its ending year (FY2026 = Oct 2025 – Sep 2026) | Every historical read is mislabelled by one year | Canonical Definition; asserted in FR-1 boundary tests |
| Existing `(factory, fiscal year)` duplicates are absent or tolerable | `.limit(1)` self-reads return an arbitrary row; no constraint can now catch it | **Survey only** — a read-only report, no schema change. If duplicates exist, resolution is a data decision, not a migration |
| Deriving fiscal year per-read is acceptable indefinitely | Boundary ambiguity persists permanently in all historical reporting | Documented in the forgone-capabilities table; revisit as a future intent if reporting disputes arise |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Buddhist Era or Common Era at the API? | User | Checkpoint 1 | **Resolved** — CE stored and exposed; frontend renders BE (+543) |
| Do Factories read their own prior-year data? | User | Checkpoint 1 | **Resolved** — all roles read history within existing scope |
| Who may write to a past fiscal year? | User | Checkpoint 1 | **Resolved** — `Role.DOED` and `Role.Evaluator` level `ODPC` |
| How far back / forward does addressing extend? | User | Checkpoint 1 | **Resolved** — open-ended both directions, no retention horizon |
| Can unfinished prior-year work be completed after rollover? | User | Checkpoint 1b | **Resolved** — yes, bounded Factory grace window (FR-5); DOED/ODPC authority does not expire |
| What must be live before 2026-10-01? | User | Checkpoint 1b | **Resolved** — the full intent |
| May the database schema change? | User | Checkpoint 2 | **Resolved** — **no**. Stored identity, uniqueness constraint, and supporting index are forgone |
| How long is the grace window? | User | Checkpoint 2 | **Resolved** — 31 days, 2026-10-01 → 2026-10-31 inclusive |
| Does grace cover enrollment edits? | User | Checkpoint 2 | **Resolved** — no; Cover completion only |
| Is ODPC past-year write authority region- or nationally-scoped? | User | Checkpoint 2 | **Resolved** — region-scoped, unchanged from today |
| What becomes of a Cover still `in_progress` at window close? | User | Checkpoint 2 | **Resolved** — remains `in_progress` permanently; no sweep, no mutation |
| Do `(factory, fiscal year)` duplicates exist in production? | Agent | During construction | **Pending** — read-only survey; no longer blocking |
