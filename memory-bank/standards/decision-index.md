---
last_updated: 2026-08-20T04:31:23Z
total_decisions: 10
---

# Decision Index

This index tracks all Architecture Decision Records (ADRs) created during Construction bolts.
Use this to find relevant prior decisions when working on related features.

## How to Use

**For Agents**: Scan the "Read when" fields below to identify decisions relevant to your current task. Before implementing new features, check if existing ADRs constrain or guide your approach. Load the full ADR for matching entries.

**For Humans**: Browse decisions chronologically or search for keywords. Each entry links to the full ADR with complete context, alternatives considered, and consequences.

---

## Decisions

### ADR-10: Paginate the Aggregate Root, Then Hydrate the Page
- **Status**: accepted
- **Date**: 2026-08-20
- **Bolt**: 027-list-pagination (list-pagination)
- **Path**: `docs/adr/0011-two-phase-read-for-computed-list-items.md`
- **Summary**: A Score Report is computed from ~40 Answer rows rather than projected from one row, so pagination and data-loading are separate concerns. The read splits into two phases: phase 1 paginates the aggregate root (Cover) in SQL; phase 2 hydrates only the page's roots with their children. Fan-out drops from ~123,000 answer rows to ~820. Two rules govern the boundary, both because breaking them fails silently: the unit of pagination is the root and never the child, and hydration is a lookup that may never add or remove an item.
- **Read when**: Paginating any list whose items are computed or aggregated rather than projected from a single row; building a dashboard, summary, or export list; reviewing a list that loads all children and slices afterwards; tempted to put `LIMIT` on a child query; deciding how to handle a parent row with no children

### ADR-9: Resolve a Cover's Current Status with a Correlated `LEFT JOIN LATERAL`
- **Status**: accepted, **amended 2026-08-20 (bolt 027)** — `coverStatus.ts` now exports two shapes: `latestCoverLogLateral` (list queries) and `latestCoverLogFor` (one known Cover). Review gate reworded to name the source of the rule rather than ban a SQL fragment.
- **Date**: 2026-08-20
- **Bolt**: 026-list-pagination (list-pagination)
- **Path**: `docs/adr/0010-lateral-latest-cover-log-resolution.md`
- **Summary**: Latest-log-wins has until now existed only in application code, but pagination requires Cover status to be testable in a `WHERE` clause so the count and the page share one predicate. A correlated `LEFT JOIN LATERAL ... ORDER BY id DESC LIMIT 1` is chosen over an uncorrelated `DISTINCT ON` subquery, which is correct but resolves every Cover in the database on every request. The resolution is extracted to `src/service/coverStatus.ts` and every caller must import it; `LIMIT 1` is a correctness control preventing one-to-many row multiplication, not an optimisation.
- **Read when**: Writing any query that filters, counts, or paginates on Cover status; working on the enrollment or score report list read paths; tempted to write an `ORDER BY` over `cover_logs`; considering denormalising a status column onto Covers; reviewing a bolt that touches latest-log-wins

### ADR-8: Offset Pagination, Not Cursor Pagination, for Staff List Endpoints
- **Status**: accepted
- **Date**: 2026-08-19
- **Bolt**: 025-list-pagination (list-pagination)
- **Path**: `docs/adr/0009-offset-pagination-for-staff-lists.md`
- **Summary**: Two pagination strategies were available for the nine staff list endpoints; cursor pagination is the stronger default for large public APIs. Offset pagination is chosen because staff list views require `total` and jump-to-page, which cursors cannot supply cheaply, and because result sets are small enough that deep-offset scan cost does not bite. Every paginated query carries a permanent total-order obligation as a result.
- **Read when**: Adding or modifying any paginated list endpoint; writing a list query and choosing its `ORDER BY`; reconsidering cursor pagination; investigating a report of a row appearing twice or being skipped while paging

### ADR-7: Replace the `enrolls` Join with an `EXISTS` Subquery in the Factory List Filter
- **Status**: accepted
- **Date**: 2026-08-19
- **Bolt**: 025-list-pagination (list-pagination)
- **Path**: `docs/adr/0008-exists-subquery-for-enrolled-filter.md`
- **Summary**: The `enrolls` join multiplies factory rows when `enrolled` is false or omitted, because the fiscal-year date predicate is applied only when `enrolled` is true — so a factory with three enrollments yields three rows. Harmless in an unpaginated list, this makes `meta.total` wrong and breaks page stability under pagination. The join is replaced by a correlated `EXISTS` predicate, removing the multiplication at source. Amends FR-6 of intent `012` for one observable behaviour: duplicate rows disappear.
- **Read when**: Working on factory list queries or the `enrolled`/`validated` filters; investigating a factory-count discrepancy between old and new API responses; adding a join to any paginated read path; reconsidering the `enrolled=false` semantics, which this ADR deliberately did **not** repair

### ADR-6: The `{ items, meta }` Pagination Envelope Is a Scoped Exception, Not a Global Wrapper
- **Status**: accepted
- **Date**: 2026-08-19
- **Bolt**: 025-list-pagination (list-pagination)
- **Path**: `docs/adr/0007-pagination-envelope-scoped-exception.md`
- **Summary**: `memory-bank/standards/api-conventions.md` states the API uses no envelope wrapper, but it also specifies offset pagination, which cannot work without returning `total`. Nine staff list endpoints therefore return `{ items, meta }` while every other route keeps its bare shape. The exception is enumerated by name and governed by one rule: an endpoint gets the envelope if and only if its result set grows with the data.
- **Read when**: Adding a new list endpoint and deciding whether to wrap it; wondering why nine endpoints differ from the rest of the API; considering wrapping or unwrapping any response; working on the location, question, or per-Cover answer reads, which deliberately stay bare arrays

### ADR-5: Delete Evidence Files on `change_score`, Not Just Hard Reject
- **Status**: accepted
- **Date**: 2026-07-07
- **Bolt**: 023-change-score-file-deletion (change-score-file-deletion)
- **Path**: `docs/adr/0006-delete-files-on-change-score.md` (this project's authoritative ADR log; kept in `docs/adr/` per existing convention rather than the bolt folder)
- **Summary**: `finalize`'s evidence-file deletion widens from "hard reject only" (`verdictChoice` null) to any Answer whose final status is `rejected`, including `change_score`. Supersedes the file-preservation clause of ADR-0005 / intent `008` FR-6; deletion stays deferred to finalize, outside-then-before the transaction, with zero MinIO I/O at save time.
- **Read when**: Working on the cover-review/finalize flow, evidence-file lifecycle, or the answer-edit/redo validator in `src/service/answer.ts`; reconsidering ADR-0005's file-deletion rules

### ADR-4: Reuse `COOKIE_SECURE` as the Production Signal for the Dev OTP Bypass
- **Status**: accepted
- **Date**: 2026-06-23
- **Bolt**: 017-dev-otp-bypass (dev-otp-bypass)
- **Path**: `bolts/017-dev-otp-bypass/adr-4-cookie-secure-as-production-signal.md`
- **Summary**: The developer OTP bypass must be impossible in production, but the codebase has no `NODE_ENV`/`APP_ENV`. We reuse the already-required `COOKIE_SECURE === true` boolean as the production signal that hard-disables the bypass, avoiding a second drift-prone "is-prod" source. Trade-off: the guard is semantically coupled to a cookie-transport flag; migrate to an explicit `APP_ENV` if a non-HTTPS production tier ever appears.
- **Read when**: Working on the dev OTP bypass, authentication/login gating, environment/production detection, or any feature that needs to behave differently in production; reconsidering whether to introduce an explicit `APP_ENV`/`NODE_ENV` discriminator

### ADR-3: National Admin (DOED) as a Second ODPC-Level Finalizer — Unlocked
- **Status**: accepted
- **Date**: 2026-06-19
- **Bolt**: 011-admin-as-evaluator (admin-as-evaluator)
- **Path**: `bolts/011-admin-as-evaluator/adr-3-admin-national-odpc-second-finalizer.md`
- **Summary**: Letting a national DOED admin finalize any Cover with full ODPC parity adds a second potential finalizer, amending ADR-0003's single-finalizer-per-region model. We leave the two-finalizer window unguarded in v1 — no locking or region-claim — relying on the existing per-Answer invariants (`finished` is sticky/immutable; the finalize gate blocks unresolved commits) to keep double-commits benign.
- **Read when**: Working on the cover-review/finalize flow, admin-as-evaluator endpoints, concurrency/race-freedom assumptions, or any feature that adds a new actor able to transition a Cover; reconsidering ADR-0003's single-finalizer model

### ADR-2: Accept SMTP as a Login-Critical Dependency (No Fallback Channel)
- **Status**: accepted
- **Date**: 2026-06-09
- **Bolt**: 003-staff-2fa (staff-2fa)
- **Path**: `bolts/003-staff-2fa/adr-2-smtp-login-critical.md`
- **Summary**: Adding email-OTP 2FA makes SMTP a blocking dependency for all DOED, Evaluator, and Provincial staff logins. We accept this risk in v1 with no fallback channel; BullMQ retries are the sole resilience mechanism.
- **Read when**: Working on authentication flows, email delivery, or any feature that adds new login-blocking dependencies; evaluating fallback channels or degraded-mode behaviour for staff login

### ADR-1: Issue Fresh OTP Code on Resend (vs. Replay Same Code)
- **Status**: accepted
- **Date**: 2026-06-09
- **Bolt**: 003-staff-2fa (staff-2fa)
- **Path**: `bolts/003-staff-2fa/adr-1-fresh-code-on-resend.md`
- **Summary**: When a staff user requests OTP resend, a new code is generated and the old one is invalidated. The per-challenge attempt counter is also reset to 0.
- **Read when**: Working on OTP resend logic, multi-attempt flows, or any feature involving time-limited one-use codes
