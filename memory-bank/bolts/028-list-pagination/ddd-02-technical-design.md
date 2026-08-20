---
unit: 001-list-pagination
bolt: 028-list-pagination
stage: design
status: complete
updated: 2026-08-20T06:58:00Z
---

# Technical Design - Documentation Correction + Contract Regression Coverage

## Architecture Pattern

**Pattern**: verify and correct. This bolt changes **no runtime source file**. Its two output
classes are documentation edits and tests.

The design's real work is not deciding how to build something — bolts 025–027 built it — but
deciding **what is genuinely missing**. Story 011 reads as if seven test areas are open. An audit of
the 84 tests already shipped by this intent shows that is not the case, and designing on the story
text alone would produce a large suite that re-proves what is already mutation-proven.

So this design does two things in order:

1. **Audit** every acceptance criterion of both stories against shipped evidence.
2. **Design only the residue** — the four Inventory-B gaps, of which two could hide a regression.

### Governing constraint

No file under `src/` changes except test files. If the implement stage finds a defect that needs a
source fix, that is a **new finding**, and it stops for a checkpoint rather than being absorbed into
a documentation bolt.

---

## Layer Structure

```text
┌───────────────────────────────────────────────────────────┐
│  Documentation                                            │
│  docs/api-conventions.md · docs/handover.md · CONTEXT.md  │  ← corrected
│  memory-bank/standards/api-conventions.md                 │
├───────────────────────────────────────────────────────────┤
│  Presentation (9 routes)                                  │  ← read-only, introspected
├───────────────────────────────────────────────────────────┤
│  Application / Domain (factory.ts, enroll.ts, score.ts,   │  ← read-only, called by tests
│  coverStatus.ts, schema/pagination.ts)                    │
├───────────────────────────────────────────────────────────┤
│  Infrastructure (PostgreSQL)                              │  ← unchanged
└───────────────────────────────────────────────────────────┘
```

Only the top band is written to. The two middle bands are **observed**: introspected for schema
composition, called directly for behaviour. This is why the bolt cannot introduce a regression of
its own.

---

## Part 1 — Story 011 coverage audit

Each acceptance criterion of story 011, checked against the shipped test reports of bolts 025–027.

| AC | Requirement | Shipped evidence | Verdict |
|----|-------------|------------------|---------|
| AC1 | Schema: omitted, explicit, `page=0`, `limit=0`, `limit=101`, non-numeric | `pagination.test.ts` — 25 focused tests, 100% line and function coverage of `src/schema/pagination.ts` | ✅ **met** |
| AC2 | Last partial page, page beyond the end, empty result, status 200 + accurate meta | 025 (window arithmetic + 20/20 integration), 027 ("page beyond the end → empty page, accurate meta, not an error") | ✅ **met** |
| AC3 | `total`/`totalPages` correct under both filters | 026 ("`meta.total` reflects the filtered population"), 027 ("`meta.total` counts scorable Covers only", `totalPages = ceil(total / limit)`) | ✅ **met** |
| AC4 | Page stability — each row exactly once across all pages | 026 (same-date enrollments page stably), 027 (**mutation-proven** by Mutation 2) | ✅ **met** |
| AC5 | Cover-status SQL parity including `none` | 026 — membership parity across all five states; `none` correctly excludes the zero-log Cover | ✅ **met** |
| AC6 | Score Report parity — Score, Category Score, Grade | 027 — `score.integration.test.ts`, 16 pre-pagination assertions unchanged and passing | ✅ **met** |
| AC7 | Role parity across Admin, Evaluator, Provincial Officer | 027 — "all three role variants return the same envelope shape" | ✅ **met** |

**Finding D1 — story 011's acceptance criteria are already satisfied.** All seven were met by
bolts 026 and 027, against a live database, with the two highest-risk assertions mutation-proven.

This is not a reason to close the story quietly. Two consequences follow:

- The **residual value** of story 011 is entirely in Inventory B, which the story text never
  mentions. B1 and B2 are real gaps that every existing test would pass through.
- The story should be closed on **cited evidence**, not on new tests written to make it look
  worked. The test report must name the file and criterion satisfying each AC, so a later reader
  can check the claim rather than trust it.

**Design decision D1**: close story 011's seven ACs on cited existing evidence; spend the bolt's
test budget on Inventory B. Alternative considered — rewrite the ACs to describe the B gaps — and
rejected: editing a story's acceptance criteria after the fact to match what was built destroys the
record of what was asked for.

---

## Part 2 — Test design (Inventory B)

Four gaps. Two are regression risks; two are assurance. They are weighted accordingly.

### B1 — `404` responses must stay unwrapped · **regression risk**

Carried unverified since bolt 025, explicitly recorded there as *"no test written"*.

`getFactories`, the enrollment reads and the score reads return `404 invalid evaluator` and
`404 provincial officer not found` when the caller's account does not resolve. These are **bare**
bodies. Nothing asserts that. A future change that wrapped every return value in the envelope would
turn a 404 into `{ items: …, meta: … }` and **every existing test would still pass**.

**Design**: call the service functions directly with a non-existent evaluator id and a non-existent
officer id. Assert status `404`, and assert the body has **no** `items` and **no** `meta` key.
Direct service invocation, not HTTP — the same technique bolts 025–027 used, so no app boot, no
Redis, no MinIO.

Covers both roles across the families that produce these codes.

### B2 — all nine routes must compose `PaginationQuery` · **regression risk**

Bolt 025 proved the schema rejects out-of-range values. Nothing proves the **routes use it**. A
route that dropped the composition would return an unbounded first page — the exact failure the
intent exists to prevent — and no shipped test would notice, because every test calls the service
directly with an already-resolved page.

**Design decision D2 — introspect the route schema; do not send HTTP requests.**

The obvious test is `GET /…?limit=101` expecting 400. It is wrong here. All nine routes sit behind
`adminGuard` / `evalGuard` / `officerGuard`, and an unauthenticated request is answered by the guard
before query validation runs. The test would assert `401` on a route with no pagination schema at
all and pass. Introspection has no such blind spot.

**Mechanism**: apply each route module's exported `(app) => app.group(…)` function to a bare Elysia
instance, read the registered route entries, and for each of the nine assert that the registered
`query` schema accepts `{}`, accepts `{ page: 2, limit: 50 }`, and rejects `page: 0`, `limit: 0`,
`limit: 101` — checked with TypeBox `Value.Check` against the registered schema, with no request
issued and no guard involved.

No database required: this file is focused, not integration.

**Risk**: importing a route module transitively constructs the service singletons, which build the
Drizzle client from `env`. Client construction does not open a connection, and `src/config.ts`
validates env at import — so the file needs a populated environment but not a reachable database.
If a module turns out to open a connection at import time, the fallback is to move B2 into the
integration file. Decide this at implement time and record which path was taken.

### B3 — envelope parity across all three families and all three roles · assurance

Bolt 027 asserted it for the three score variants. The factory and enrollment families were verified
per-endpoint but never compared **across** roles in one assertion.

**Design**: one table-driven test over all nine service reads. For each, assert the response has
exactly the keys `items` and `meta`; `items` is an array; `meta` carries `page`, `limit`, `total`,
`totalPages` with numeric types and `totalPages === Math.ceil(total / limit)`. Integration, since
six of the nine need a database.

This is the test that fails loudly if any one endpoint drifts back to a bare array.

### B4 — OpenAPI `query` and `200` schemas · assurance

Never inspected. Assumed correct because generated from the route definitions.

**Design decision D3 — automate the half that can be automated; do the rest manually and record it.**

The OpenAPI document is generated from the same registered route metadata that B2 introspects.
Extending B2's introspection to assert the registered `response[200]` schema is the `Paginated`
envelope covers the `200` half **structurally**, and the `query` half is B2 itself. What
introspection cannot prove is that the Swagger layer renders them faithfully.

That last step is a **one-time manual verification** against a running dev instance at
`/twhp/api/document`, with the observed `query` and `200` schema for one route of each family
pasted into the test report as evidence. Recorded honestly as manual, not dressed up as a test.

### File placement

Consistent with the layout bolts 025–027 established — focused tests need no database, integration
tests do.

| File | New/existing | Contents | DB |
|------|--------------|----------|-----|
| `src/service/pagination-routes.test.ts` | **new** | B2 route-schema introspection ×9, plus the `response[200]` half of B4 | no |
| `src/service/pagination-contract.integration.test.ts` | **new** | B1 unwrapped 404s, B3 envelope parity ×9 | yes |

No existing test file is modified. Nothing already passing is touched.

**Design decision D4**: two new files rather than appending to `pagination.test.ts`. That file is
bolt 025's, is scoped to `src/schema/pagination.ts`, and reports 100% coverage of it — appending
cross-cutting route tests would make that coverage figure mean something different than it says.

---

## Part 3 — Documentation design

The domain model inventoried six falsified claims (A1–A6). A sweep of every list-shape statement
across `docs/`, `CONTEXT.md` and `memory-bank/standards/` during this stage found **three more**.

### Inventory A, extended

| # | Location | Correction | Source |
|---|----------|------------|--------|
| A1 | `docs/api-conventions.md:129` | Replace *"There is no pagination contract"* with the contract, plus the scope boundary (nine endpoints in, everything else deliberately out — ADR-0007) | domain model |
| A2 | `docs/api-conventions.md:131-137` | Replace the three-item ordering list with the total order now contracted for all nine | domain model |
| A3 | `docs/api-conventions.md:145` | Inner-join → correlated `EXISTS` (ADR-0008). Selection semantics preserved; the duplicate-row consequence is gone | domain model |
| A4 | `docs/handover.md:81` | *"Lists are unpaginated"* — false for the nine | domain model |
| A5 | `docs/handover.md:166` | Pagination/order half of the open question is answered; the volume half stays open | domain model |
| A6 | `memory-bank/standards/api-conventions.md:57` | *"Limit defaults to be defined per-endpoint"* → default 20, min 1, max 100, uniform | domain model |
| **A7** | `docs/api-conventions.md:166` | *"Successful reads normally return an object or array directly, without a `{data, meta}` envelope."* Hedged by *"normally"*, so not false — but it is the client-facing statement of response shape and must now name the nine as the exception, or A1 and A7 read as contradicting each other | **this stage** |
| **A8** | `CONTEXT.md:60` | *"For list endpoints … the response is an array of Score Reports"* — **false**. The domain model's inventory covered `docs/` and `memory-bank/` but not the domain context itself | **this stage** |
| **A9** | `memory-bank/standards/api-conventions.md:5, 23, 25` | *"no envelope wrapper"*, stated flatly three times. ADR-0007 already carved out the exception and `decision-index.md:53-58` records it — but **the standard it amends was never edited**, so the standard contradicts its own accepted ADR | **this stage** |

**Finding D2 — A9 is the one that matters most.** The other eight are documents lagging behind code,
which is ordinary. A9 is a standard contradicting an ADR that was accepted specifically to amend it.
An ADR that does not change the standard it amends has not finished doing its job, and the next
contributor who reads the standard alone gets the pre-ADR rule. Amend the standard and cite ADR-0007
inline.

### Editing approach

`docs/api-conventions.md` — rewrite the whole *Parameters, filtering, and ordering* section, not the
one remembered sentence. The section gets, in order: parameter names and bounds; 1-indexed pages;
the `{ items, meta }` envelope with `total` and `totalPages`; the per-family ordering table; the
scope boundary citing ADR-0007; and a **Breaking change** subsection naming all nine endpoints
explicitly. Then A7 near line 166, and A3 in the filtering paragraph.

Preserved deliberately, per the domain model: the `enrolled=false` paragraph, including its warning
that the semantics are current behaviour and not a stable contract. This intent chose not to repair
that, and the warning is still accurate.

### Vocabulary constraint

The corrected documents use the intent's established terms — Page, Limit, Offset, Total, Total
Pages, Envelope, Meta, Total Order, Page Stability, Empty Page, Cover Status, latest-log-wins,
filter pushdown, Scorable Cover, two-phase read, hydration, fan-out.

They must not introduce *cursor*, *hasNext*, *hasPrev*, *paginated answers* or *cached score* —
terms the intent deliberately excluded. Writing them into documentation would advertise a contract
that does not exist.

---

## API Design

No endpoint is added, removed, renamed or changed. The nine keep exactly the contract bolts 025–027
shipped:

```text
GET  <nine staff list paths>?page={int ≥1, default 1}&limit={int 1..100, default 20}
200  { items: T[], meta: { page, limit, total, totalPages } }
400  validation failure (page=0, limit=0, limit=101, non-numeric)
404  bare body, no envelope            ← B1 makes this a tested contract
```

The design contribution here is that the last line stops being an assumption.

---

## Data Model

No table, column, constraint or migration changes.

One **outstanding infrastructure dependency** is carried forward, not resolved by this bolt:
`idx_coverlogs_cover_id_id` was created directly on the database by the maintainer and is depended
on by bolts 026 and 027 (78–87× on the count queries). **No migration exists in the repository.** A
fresh environment built from the repo will not have it, and both bolts' performance guarantees
silently fail there.

This bolt cannot fix it — the intent's technical constraints exclude schema changes, and it is not
in either story's scope. It must appear as a named open item in the closing documentation, per
Finding 4 of the domain model. Recording it is in scope; fixing it is not.

---

## Security Design

| Concern | Approach |
|---------|----------|
| Role guards | Untouched. No route file is edited. B2 introspects registered schemas without invoking guards, so it cannot weaken one. |
| Scope predicates (region, province, fiscal year) | Untouched. Already verified by 026/027 to apply to count and page alike. |
| Resource exhaustion via `limit` | The `limit ≤ 100` ceiling is the control. B2 turns "the schema enforces it" into "all nine routes enforce it" — this bolt's only real security strengthening. |
| Documentation disclosure | The corrected documents describe an existing public contract. No internal identifier, credential or host name is added. |

---

## NFR Implementation

| Requirement | Approach |
|-------------|----------|
| No performance regression | No runtime code changes; nothing to regress. No new benchmark run. |
| Test suite runtime | Two small files, ~20 tests total, against a suite of 261. Negligible. |
| Test determinism | B2 is pure schema checking — no I/O, no clock, no ordering dependency. B3 asserts shape and the `totalPages` identity, never a specific row order, so it cannot become flaky as seed data changes. |
| Documentation durability | Every corrected claim cites its ADR (0007, 0008) so the next reader can trace the reasoning rather than re-deriving it. |

---

## Integrations

None. No queue, worker, MinIO, Redis or SMTP path is involved.

---

## Risks and Open Items

| # | Risk / item | Handling |
|---|-------------|----------|
| R1 | Importing a route module at test time opens a DB connection, breaking the no-DB focused file | Fallback designed: move B2 into the integration file. Decide at implement time, record the choice. |
| R2 | B1 finds that a 404 **is** already wrapped | Then it is a real defect, not a test gap. Stop at a checkpoint — a source fix is outside this bolt's governing constraint. |
| R3 | The manual OpenAPI check (B4) needs a running dev instance | If unavailable, report B4 as **not verified** with the reason. Do not infer it from the introspection and call it done. |
| **O1** | Release-order confirmation the bolt requires before it closes: if pagination ships before the export intent, a full-data consumer is silently truncated to 20 rows with no error | **Human decision. Raised at the Stage 4 checkpoint at the latest — it gates the bolt, not the design.** |
| O2 | Three latest-log-wins duplicates remain in `answer.ts` ×2 and `cover.ts`; ADR-0010's review gate stays narrowed to the list read paths until consolidated | Named as open work in the closing documentation. Not fixed here. |
| O3 | No migration for `idx_coverlogs_cover_id_id` | Named as open work. Not fixed here. |

---

## Completion Criteria

- [x] Architecture pattern selected and documented — verify-and-correct, zero runtime source change
- [x] Layer responsibilities defined — one band written, two observed
- [x] API contracts defined — unchanged, with the bare-404 contract made explicit
- [x] Data model addressed — no change; the missing index migration recorded as a carried dependency
- [x] NFRs addressed — determinism, runtime, durability
- [x] Security patterns applied — guards untouched; the `limit` ceiling gains route-level proof

## Findings

1. **Story 011's acceptance criteria are already met** (D1). The bolt's remaining value is Inventory
   B, which the story never mentions. Designing from the story text alone would have produced a
   redundant suite and left B1 and B2 open.

2. **Only B1 and B2 can hide a regression.** Both share one property: every existing test passes
   through the failure. B1 because no test reads a 404 body; B2 because every test calls the service
   directly and never traverses a route schema.

3. **Three further falsified claims exist beyond the domain model's six** (A7, A8, A9). A9 is the
   serious one: a standard still stating a rule that an accepted ADR was written to amend.

4. **B2 must introspect, not request** (D2). A guard answers before query validation, so the natural
   HTTP test would pass against a route with no pagination schema at all.
